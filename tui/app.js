import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file runs from the built tui/dist/app.mjs, so the repo root is two
// levels up (dist -> tui -> root), not one.
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

const DEFAULT_CONFIG = { default_model: 'z-ai/glm-5.2', active_tab: 'api_key', api_keys: [], active_profile: null };

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

// Create config.json on first run; migrate an older single-key config.json
// (flat `api_key` string) into the profile list (`api_keys: [{name, api_key}]`).
(function migrateConfig() {
  const existing = loadConfig();
  let cfg = { ...existing };
  let changed = false;

  if (!Array.isArray(cfg.api_keys)) {
    if (typeof cfg.api_key === 'string' && cfg.api_key) {
      cfg.api_keys = [{ name: 'Default', api_key: cfg.api_key }];
      cfg.active_profile = 'Default';
    } else {
      cfg.api_keys = [];
      cfg.active_profile = null;
    }
    changed = true;
  }
  if ('api_key' in cfg) {
    delete cfg.api_key;
    changed = true;
  }

  cfg = { ...DEFAULT_CONFIG, ...cfg };
  if (changed || JSON.stringify(cfg) !== JSON.stringify(existing)) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
      // Non-fatal — the in-memory merged value is still used for this session.
    }
  }
})();

const TABS = ['api_key', 'models', 'exit'];
const ACTIONS = ['Switch to selected', 'Edit API key', 'Delete API key', 'Create API key'];

// ── Fixed-width row helpers (same convention as Gemi_MCP_V2's list panes) —
// build each row as one already-clipped string instead of letting Ink/the
// terminal wrap long text, which is what pushed rows onto a second line.
// ponytail: no CJK/full-width-char accounting like Gemi's displayWidth (profile
// names/keys here are ASCII); add it if this ever needs to render CJK text. ──
function padEndDisplay(str, width) {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}
function truncateDisplay(str, width) {
  return str.length <= width ? str : str.slice(0, Math.max(0, width));
}

// Mask an API key for display: nvapi-XXXX********YYYY (keep the "nvapi-"
// prefix and first 4 chars of the id visible, plus the last 4 chars).
function maskApiKey(key) {
  if (!key) return '(empty)';
  const prefix = 'nvapi-';
  const body = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  if (body.length <= 8) return key;
  const shown = key.startsWith(prefix) ? prefix : '';
  return `${shown}${body.slice(0, 4)}********${key.slice(-4)}`;
}

// ── Header — same convention as Gemi_MCP_V2's Header: bordered status strip
// above the menu bar, current profile/model separated by " │ ". ────────────
const Header = React.memo(function Header({ activeProfileName, defaultModel }) {
  return (
    <Box borderStyle="single" paddingX={1} height={3} overflow="hidden">
      <Text bold color="green">NIM MCP</Text>
      <Text>  │  profile: <Text color="cyan" bold>{activeProfileName || '(none)'}</Text></Text>
      <Text>  │  default model: <Text color="cyan" bold>{defaultModel || '(none)'}</Text></Text>
    </Box>
  );
});

// ── Menu bar — same convention as Gemi_MCP_V2: highlighted tab = active mode ─
const MenuBar = React.memo(function MenuBar({ activeTab, mode }) {
  const isMenu = mode === 'menu';
  return (
    <Box flexDirection="row" paddingX={1} marginTop={0} height={1} overflow="hidden">
      <Text
        color={activeTab === 'api_key' ? (isMenu ? 'black' : 'cyan') : 'gray'}
        backgroundColor={isMenu && activeTab === 'api_key' ? 'cyan' : undefined}
        bold={!isMenu && activeTab === 'api_key'}
      >
        {' API KEY '}
      </Text>
      <Text>  </Text>
      <Text
        color={activeTab === 'models' ? (isMenu ? 'black' : 'cyan') : 'gray'}
        backgroundColor={isMenu && activeTab === 'models' ? 'cyan' : undefined}
        bold={!isMenu && activeTab === 'models'}
      >
        {' MODELS '}
      </Text>
      <Text>  </Text>
      <Text
        color={activeTab === 'exit' ? (isMenu ? 'black' : 'red') : 'gray'}
        backgroundColor={isMenu && activeTab === 'exit' ? 'red' : undefined}
        bold={!isMenu && activeTab === 'exit'}
      >
        {' EXIT '}
      </Text>
      <Text>  </Text>
      {isMenu && <Text dimColor>(← → switch, ↓/Enter select)</Text>}
    </Box>
  );
});

function YesNoConfirm({ message, selected, height }) {
  return (
    <Box height={height} flexDirection="column" justifyContent="center" alignItems="center">
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text backgroundColor={selected === 0 ? 'cyan' : undefined} color={selected === 0 ? 'black' : undefined}> Yes </Text>
        <Text>  </Text>
        <Text backgroundColor={selected === 1 ? 'cyan' : undefined} color={selected === 1 ? 'black' : undefined}> No </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>(← → choose, Enter confirm, Esc cancel)</Text>
      </Box>
    </Box>
  );
}

// ── API KEY tab, panel view — left: action list; right: saved profiles ──────
// Right column follows Gemi_MCP_V2's AccountsPane convention: a frozen header
// row (highlighted, never scrolls), then rows built as one fixed-width string
// per profile (name column + key column, truncated — never wrapped).
function ApiKeyPanels({ mode, actionSelected, profiles, profileSelected, activeProfileName, height, leftWidth, rightWidth }) {
  const innerWidth = Math.max(10, rightWidth - 4); // minus border(2) + paddingX(2)
  const nameWidth = Math.min(20, Math.max(8, 'Profile'.length, ...profiles.map((p) => (p.name || '').length)));
  const GUTTER = 2; // '★ ' or '  ' marker column
  const COL_GAP = 2; // spacing between the name and key columns
  const prefixWidth = GUTTER + nameWidth + COL_GAP;
  const keyWidth = Math.max(4, innerWidth - prefixWidth);
  const headerRow = padEndDisplay(' '.repeat(GUTTER) + padEndDisplay('Profile', nameWidth) + ' '.repeat(COL_GAP) + 'API Key', innerWidth);

  const win = windowed(profiles, profileSelected, height - 1); // -1 for the header row

  return (
    <Box height={height}>
      <Box width={leftWidth} height={height} borderStyle="single" borderColor={mode === 'left' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
        <Text dimColor>Action:</Text>
        {ACTIONS.map((a, i) => {
          const isCursor = mode === 'left' && i === actionSelected;
          return (
            <Text key={a} backgroundColor={isCursor ? 'cyan' : undefined} color={isCursor ? 'black' : undefined}>
              {i === actionSelected ? '› ' : '  '}{a}
            </Text>
          );
        })}
      </Box>
      <Box width={rightWidth} height={height} borderStyle="single" borderColor={mode === 'right' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
        <Text backgroundColor="blue" color="white">{headerRow}</Text>
        {profiles.length === 0 && <Text dimColor>(none yet — use Create API key)</Text>}
        {win.items.map((p, i) => {
          const idx = win.start + i;
          const isCursor = mode === 'right' && idx === profileSelected;
          const isActive = p.name === activeProfileName;
          const nm = padEndDisplay(truncateDisplay(p.name || '', nameWidth), nameWidth);
          const keyStr = truncateDisplay(maskApiKey(p.api_key), keyWidth);
          const rowStr = padEndDisplay(`${isActive ? '★' : ' '} ${nm}  ${keyStr}`, innerWidth);
          return (
            <Text key={`${p.name}-${idx}`} backgroundColor={isCursor ? 'cyan' : undefined} color={isCursor ? 'black' : undefined}>
              {rowStr}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

// ── API KEY tab, create/edit form — profile name box, then key box ──────────
function ApiKeyForm({ mode, nameDraft, keyDraft, chooseSelected, editing, height }) {
  const namingActive = mode === 'apikey_name_typing';
  const keyingActive = mode === 'apikey_key_typing';
  const choosing = mode === 'apikey_choose';
  return (
    <Box height={height} flexDirection="column" paddingX={1}>
      <Text dimColor>{editing ? 'Edit' : 'Create'} API key profile:</Text>
      <Text dimColor>Profile name:</Text>
      <Box borderStyle="round" borderColor={namingActive ? 'cyan' : 'gray'} paddingX={1}>
        <Text>{nameDraft.length ? nameDraft : '(empty)'}{namingActive ? '█' : ''}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>API key:</Text>
      </Box>
      <Box borderStyle="round" borderColor={keyingActive ? 'cyan' : 'gray'} paddingX={1}>
        <Text>{keyDraft.length ? keyDraft : '(empty)'}{keyingActive ? '█' : ''}</Text>
      </Box>
      {choosing && (
        <Box marginTop={1}>
          <Text backgroundColor={chooseSelected === 0 ? 'cyan' : undefined} color={chooseSelected === 0 ? 'black' : undefined}> Save </Text>
          <Text>  </Text>
          <Text backgroundColor={chooseSelected === 1 ? 'cyan' : undefined} color={chooseSelected === 1 ? 'black' : undefined}> Cancel </Text>
        </Box>
      )}
    </Box>
  );
}

// Cap rendered rows to the panel's actual height (minus its header line) so a
// long list can't push the panel taller than the fixed content area; keeps
// the selected row scrolled into view.
function windowed(list, selected, rows) {
  const visible = Math.max(1, rows - 1);
  const start = Math.max(0, Math.min(selected - Math.floor(visible / 2), Math.max(0, list.length - visible)));
  return { start, items: list.slice(start, start + visible) };
}

// ── Models tab — left: owned_by categories (API's own order); right: models
// for the selected category, A–Z. Enter on the right sets config.json's
// default_model, used by server.py when a tool call doesn't specify one. ──
function ModelsTab({ mode, loading, error, vendors, vendorSelected, vendorModels, modelSelected, defaultModel, height }) {
  if (loading) {
    return (
      <Box height={height} alignItems="center" justifyContent="center">
        <Text dimColor>Loading models from NVIDIA NIM…</Text>
      </Box>
    );
  }
  if (error) {
    return (
      <Box height={height} alignItems="center" justifyContent="center">
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  const vendorWin = windowed(vendors, vendorSelected, height);
  const modelWin = windowed(vendorModels, modelSelected, height);

  return (
    <Box height={height}>
      <Box width="35%" height={height} borderStyle="single" borderColor={mode === 'left' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
        <Text dimColor>Vendor (owned_by):</Text>
        {vendorWin.items.map((v, i) => {
          const idx = vendorWin.start + i;
          const isCursor = mode === 'left' && idx === vendorSelected;
          return (
            <Text key={v} backgroundColor={isCursor ? 'cyan' : undefined} color={isCursor ? 'black' : undefined}>
              {idx === vendorSelected ? '› ' : '  '}{v}
            </Text>
          );
        })}
      </Box>
      <Box width="65%" height={height} borderStyle="single" borderColor={mode === 'right' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
        <Text dimColor>Models (A–Z) — Enter sets default_model (★):</Text>
        {modelWin.items.map((m, i) => {
          const idx = modelWin.start + i;
          const isCursor = mode === 'right' && idx === modelSelected;
          const isDefault = m.id === defaultModel;
          return (
            <Text key={m.id} backgroundColor={isCursor ? 'cyan' : undefined} color={isCursor ? 'black' : undefined}>
              {isDefault ? '★ ' : '  '}{m.id}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}

function Footer({ mode, activeTab }) {
  let hint;
  if (mode === 'menu') hint = '[← →] switch tab  [Enter/↓] select  [Ctrl+C] quit';
  else if (mode === 'apikey_name_typing') hint = '[type] edit name  [Enter] next field  [Esc/Tab] back';
  else if (mode === 'apikey_key_typing') hint = '[type] edit key  [Enter] continue to Save/Cancel  [Esc/Tab] back';
  else if (mode === 'apikey_choose') hint = '[← →] Save/Cancel  [Enter] confirm  [Esc/Tab] back';
  else if (mode === 'apikey_delete_confirm') hint = '[← →] choose  [Enter] confirm  [Esc/Tab] cancel';
  else if (mode === 'left' && activeTab === 'api_key') hint = '[↑↓] choose action  [→/Enter] pick profile (Enter=create)  [Esc/Tab] back';
  else if (mode === 'right' && activeTab === 'api_key') hint = '[↑↓] navigate  [Enter] run action  [←/Esc/Tab] back';
  else if (mode === 'left') hint = '[↑↓] pick vendor  [→] models  [Esc/Tab] back';
  else if (mode === 'right') hint = '[↑↓] navigate  [Enter] set default  [←/Esc/Tab] back';
  else hint = '[Ctrl+C] quit';
  return (
    <Box paddingX={1} height={1} overflow="hidden">
      <Text dimColor wrap="truncate-end">{hint}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  // Same approach as Gemi_MCP_V2: track terminal rows in state (updated on the
  // stdout 'resize' event) rather than reading stdout.rows fresh each render.
  const [termRows, setTermRows] = useState(stdout?.rows ?? 24);
  const [termCols, setTermCols] = useState(stdout?.columns ?? 80);
  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setTermRows(stdout.rows ?? 24);
      setTermCols(stdout.columns ?? 80);
    };
    stdout.on('resize', onResize);
    return () => stdout.off('resize', onResize);
  }, [stdout]);
  // Fixed content height, independent of which tab/mode is active. Every tab
  // renders exactly this many rows (padding with blank space if it has less
  // content) so total output height never changes between renders — a
  // varying height is what causes Ink to leave stale frames behind when
  // switching tabs (the "ghost" duplicate-menu-bar bug). Header (3, bordered),
  // MenuBar (1) and Footer (1) are each hard-capped, so 5 rows covers them.
  const mainHeight = Math.max(6, termRows - 5);
  // Fixed numeric panel widths (not percentage strings) so row strings can be
  // built to an exact character width — same as Gemi's leftPanelWidth/rightPanelWidth.
  const leftPanelWidth = 30;
  const rightPanelWidth = Math.max(20, termCols - leftPanelWidth);
  const [activeTab, setActiveTab] = useState('api_key');
  // mode: 'menu' | 'left' | 'right' (panel focus, shared by API KEY and MODELS tabs) |
  //       'apikey_name_typing' | 'apikey_key_typing' | 'apikey_choose' | 'apikey_delete_confirm' |
  //       'exit_confirm'
  const [mode, setMode] = useState('menu');
  const [exitConfirmSelected, setExitConfirmSelected] = useState(0);

  const initialCfg = loadConfig();
  const [apiKeyProfiles, setApiKeyProfiles] = useState(initialCfg.api_keys || []);
  const [activeProfileName, setActiveProfileName] = useState(initialCfg.active_profile || null);
  const [actionSelected, setActionSelected] = useState(0); // index into ACTIONS
  const [profileSelected, setProfileSelected] = useState(0); // index into apiKeyProfiles
  const [editingIndex, setEditingIndex] = useState(null); // null = creating a new profile
  const [nameDraft, setNameDraft] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [apikeyChooseSelected, setApikeyChooseSelected] = useState(0); // 0 = Save, 1 = Cancel
  const [deleteConfirmSelected, setDeleteConfirmSelected] = useState(0); // 0 = Yes, 1 = No

  const [models, setModels] = useState(null); // null = not fetched yet
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [vendorSelected, setVendorSelected] = useState(0);
  const [modelSelected, setModelSelected] = useState(0);
  const [defaultModel, setDefaultModel] = useState(loadConfig().default_model || '');

  // The TUI only loaded config.json once, at mount -- so an external edit
  // (hand-editing the file, or another tool writing to it) while the TUI is
  // already open left the displayed profile/model stuck showing stale data.
  // Re-read the file whenever the user drills into a tab from the menu bar,
  // so what's on screen always matches what's actually on disk.
  function refreshFromDisk() {
    const cfg = loadConfig();
    const profiles = cfg.api_keys || [];
    setApiKeyProfiles(profiles);
    setActiveProfileName(cfg.active_profile || null);
    setDefaultModel(cfg.default_model || '');
    // Clamp in case the profile list shrank (or changed) since this state was last set.
    setProfileSelected((s) => Math.max(0, Math.min(s, profiles.length - 1)));
  }

  // Fetch the model catalog once, the first time the MODELS tab is opened.
  // Category = owned_by, kept in the order the API returns it (no re-sorting).
  useEffect(() => {
    if (activeTab !== 'models' || models !== null || modelsLoading) return;
    const cfg = loadConfig();
    const active = (cfg.api_keys || []).find((p) => p.name === cfg.active_profile);
    const key = active && active.api_key;
    if (!key) {
      setModelsError('No active API key profile — go to the API KEY tab and switch to (or create) one first.');
      return;
    }
    setModelsLoading(true);
    fetch('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setModels(json.data || []))
      .catch((err) => setModelsError(err.message))
      .finally(() => setModelsLoading(false));
  }, [activeTab, models, modelsLoading]);

  const vendors = models ? [...new Set(models.map((m) => m.owned_by))] : [];
  const vendorModels = models
    ? models.filter((m) => m.owned_by === vendors[vendorSelected]).sort((a, b) => a.id.localeCompare(b.id))
    : [];

  useEffect(() => {
    setModelSelected(0);
  }, [vendorSelected]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (mode === 'exit_confirm') {
      if (key.leftArrow || key.rightArrow) {
        setExitConfirmSelected((s) => (s === 0 ? 1 : 0));
      }
      if (key.escape || key.tab) {
        setMode('menu');
        setActiveTab('api_key');
        return;
      }
      if (key.return) {
        if (exitConfirmSelected === 0) {
          exit();
        } else {
          setMode('menu');
          setActiveTab('api_key');
        }
      }
      return;
    }

    if (mode === 'apikey_delete_confirm') {
      if (key.leftArrow || key.rightArrow) {
        setDeleteConfirmSelected((s) => (s === 0 ? 1 : 0));
      }
      if (key.escape || key.tab) {
        setMode('right');
        return;
      }
      if (key.return) {
        if (deleteConfirmSelected === 0) {
          const target = apiKeyProfiles[profileSelected];
          const newList = apiKeyProfiles.filter((_, i) => i !== profileSelected);
          let newActive = activeProfileName;
          if (target && target.name === activeProfileName) {
            newActive = newList.length ? newList[0].name : null;
          }
          saveConfig({ api_keys: newList, active_profile: newActive });
          setApiKeyProfiles(newList);
          setActiveProfileName(newActive);
          setProfileSelected((s) => Math.max(0, Math.min(s, newList.length - 1)));
        }
        setMode('right');
      }
      return;
    }

    // ── Tab / Esc: context-aware back navigation ─────────────────────────
    if (key.tab || key.escape) {
      if (mode === 'right') setMode('left');
      else if (mode === 'apikey_key_typing') setMode('apikey_name_typing');
      else if (mode === 'apikey_choose') setMode('apikey_key_typing');
      else if (mode === 'apikey_name_typing') setMode(editingIndex === null ? 'left' : 'right');
      else setMode('menu');
      return;
    }

    // ── Menu bar ─────────────────────────────────────────────────────────
    if (mode === 'menu') {
      if (key.leftArrow || key.rightArrow) {
        setActiveTab((prev) => {
          const i = TABS.indexOf(prev);
          const step = key.rightArrow ? 1 : -1;
          return TABS[(i + step + TABS.length) % TABS.length];
        });
      }
      if (key.return || key.downArrow) {
        if (activeTab === 'exit') {
          setMode('exit_confirm');
          setExitConfirmSelected(0);
        } else if (activeTab === 'api_key') {
          refreshFromDisk();
          setActionSelected(0);
          setMode('left');
        } else {
          refreshFromDisk();
          setMode('left');
        }
      }
      return;
    }

    // ── API KEY tab: left panel — action list ─────────────────────────────
    if (mode === 'left' && activeTab === 'api_key') {
      if (key.upArrow) setActionSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) setActionSelected((s) => Math.min(ACTIONS.length - 1, s + 1));
      if (key.rightArrow && actionSelected !== 3 && apiKeyProfiles.length > 0) {
        setProfileSelected(0);
        setMode('right');
      }
      if (key.return) {
        if (actionSelected === 3) {
          setEditingIndex(null);
          setNameDraft('');
          setKeyDraft('');
          setMode('apikey_name_typing');
        } else if (apiKeyProfiles.length > 0) {
          setProfileSelected(0);
          setMode('right');
        }
      }
      return;
    }

    // ── API KEY tab: right panel — profile list, action runs on Enter ─────
    if (mode === 'right' && activeTab === 'api_key') {
      if (key.upArrow) setProfileSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) setProfileSelected((s) => Math.min(Math.max(0, apiKeyProfiles.length - 1), s + 1));
      if (key.leftArrow) setMode('left');
      if (key.return) {
        const p = apiKeyProfiles[profileSelected];
        if (p) {
          if (actionSelected === 0) {
            // Switch to selected
            saveConfig({ active_profile: p.name });
            setActiveProfileName(p.name);
          } else if (actionSelected === 1) {
            // Edit API key
            setEditingIndex(profileSelected);
            setNameDraft(p.name);
            setKeyDraft(p.api_key);
            setMode('apikey_name_typing');
          } else if (actionSelected === 2) {
            // Delete API key
            setDeleteConfirmSelected(0);
            setMode('apikey_delete_confirm');
          }
        }
      }
      return;
    }

    // ── API KEY tab: create/edit — stage 1, profile name ──────────────────
    if (mode === 'apikey_name_typing') {
      if (key.return) {
        setMode('apikey_key_typing');
        return;
      }
      if (key.backspace || key.delete) {
        setNameDraft((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNameDraft((s) => s + input);
      }
      return;
    }

    // ── API KEY tab: create/edit — stage 2, key value ─────────────────────
    if (mode === 'apikey_key_typing') {
      if (key.return) {
        setApikeyChooseSelected(0);
        setMode('apikey_choose');
        return;
      }
      if (key.backspace || key.delete) {
        setKeyDraft((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setKeyDraft((s) => s + input);
      }
      return;
    }

    // ── API KEY tab: create/edit — stage 3, Save / Cancel ─────────────────
    if (mode === 'apikey_choose') {
      if (key.leftArrow || key.rightArrow) {
        setApikeyChooseSelected((s) => (s === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        const returnMode = editingIndex === null ? 'left' : 'right';
        if (apikeyChooseSelected === 0) {
          const trimmedName = nameDraft.trim() || '(unnamed)';
          let newList;
          if (editingIndex === null) {
            newList = [...apiKeyProfiles, { name: trimmedName, api_key: keyDraft }];
          } else {
            newList = apiKeyProfiles.map((p, i) => (i === editingIndex ? { name: trimmedName, api_key: keyDraft } : p));
          }
          let newActive = activeProfileName;
          if (editingIndex !== null && apiKeyProfiles[editingIndex] && apiKeyProfiles[editingIndex].name === activeProfileName) {
            newActive = trimmedName;
          }
          if (!newActive && newList.length === 1) newActive = newList[0].name;
          saveConfig({ api_keys: newList, active_profile: newActive });
          setApiKeyProfiles(newList);
          setActiveProfileName(newActive);
        }
        setMode(returnMode);
        return;
      }
      return;
    }

    // ── MODELS tab: left panel — vendor (owned_by) list ───────────────────
    if (mode === 'left') {
      if (key.upArrow) setVendorSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) setVendorSelected((s) => Math.min(Math.max(0, vendors.length - 1), s + 1));
      if (key.rightArrow && vendorModels.length > 0) {
        setModelSelected(0);
        setMode('right');
      }
      return;
    }

    // ── MODELS tab: right panel — model list for the selected vendor ──────
    if (mode === 'right') {
      if (key.upArrow) setModelSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) setModelSelected((s) => Math.min(Math.max(0, vendorModels.length - 1), s + 1));
      if (key.leftArrow) setMode('left');
      if (key.return) {
        const picked = vendorModels[modelSelected];
        if (picked) {
          saveConfig({ default_model: picked.id });
          setDefaultModel(picked.id);
        }
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Header activeProfileName={activeProfileName} defaultModel={defaultModel} />
      <MenuBar activeTab={activeTab} mode={mode} />
      {mode === 'exit_confirm' && <ExitConfirmWrapper selected={exitConfirmSelected} height={mainHeight} />}
      {mode === 'apikey_delete_confirm' && (
        <YesNoConfirm
          message={`Delete profile "${(apiKeyProfiles[profileSelected] || {}).name || ''}"?`}
          selected={deleteConfirmSelected}
          height={mainHeight}
        />
      )}
      {mode !== 'exit_confirm' && mode !== 'apikey_delete_confirm' && activeTab === 'api_key' && (
        ['apikey_name_typing', 'apikey_key_typing', 'apikey_choose'].includes(mode) ? (
          <ApiKeyForm
            mode={mode}
            nameDraft={nameDraft}
            keyDraft={keyDraft}
            chooseSelected={apikeyChooseSelected}
            editing={editingIndex !== null}
            height={mainHeight}
          />
        ) : (
          <ApiKeyPanels
            mode={mode}
            actionSelected={actionSelected}
            profiles={apiKeyProfiles}
            profileSelected={profileSelected}
            activeProfileName={activeProfileName}
            height={mainHeight}
            leftWidth={leftPanelWidth}
            rightWidth={rightPanelWidth}
          />
        )
      )}
      {mode !== 'exit_confirm' && mode !== 'apikey_delete_confirm' && activeTab === 'models' && (
        <ModelsTab
          mode={mode}
          loading={modelsLoading}
          error={modelsError}
          vendors={vendors}
          vendorSelected={vendorSelected}
          vendorModels={vendorModels}
          modelSelected={modelSelected}
          defaultModel={defaultModel}
          height={mainHeight}
        />
      )}
      {mode !== 'exit_confirm' && mode !== 'apikey_delete_confirm' && activeTab === 'exit' && (
        <Box height={mainHeight} alignItems="center" justifyContent="center">
          <Text dimColor>Press Enter to quit</Text>
        </Box>
      )}
      <Footer mode={mode} activeTab={activeTab} />
    </Box>
  );
}

function ExitConfirmWrapper({ selected, height }) {
  return <YesNoConfirm message="Quit NIM MCP?" selected={selected} height={height} />;
}

render(<App />);
