import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This file runs from the built tui/dist/app.mjs, so the repo root is two
// levels up (dist -> tui -> root), not one.
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

const DEFAULT_CONFIG = { default_model: 'z-ai/glm-5.2', active_tab: 'api', api_key: '' };

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

// Create config.json on first run, and backfill any keys (e.g. api_key) missing
// from a config.json written before this field existed.
if (!fs.existsSync(CONFIG_PATH)) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to create default config.json:', e.message);
  }
} else {
  const existing = loadConfig();
  const merged = { ...DEFAULT_CONFIG, ...existing };
  if (JSON.stringify(merged) !== JSON.stringify(existing)) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
    } catch (e) {
      // Non-fatal — the in-memory merged value is still used for this session.
    }
  }
}

const TABS = ['api', 'models', 'exit'];

// ── Menu bar — same convention as Gemi_MCP_V2: highlighted tab = active mode ─
const MenuBar = React.memo(function MenuBar({ activeTab, mode, defaultModel }) {
  const isMenu = mode === 'menu';
  return (
    <Box flexDirection="row" paddingX={1} marginTop={0}>
      <Text
        color={activeTab === 'api' ? (isMenu ? 'black' : 'cyan') : 'gray'}
        backgroundColor={isMenu && activeTab === 'api' ? 'cyan' : undefined}
        bold={!isMenu && activeTab === 'api'}
      >
        {' API '}
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
      <Box flexGrow={1} />
      <Text dimColor>default model: </Text>
      <Text color="cyan">{defaultModel || '(none)'}</Text>
    </Box>
  );
});

// ── API tab — single textbox showing/editing the NIM API key ────────────────
function ApiTab({ mode, draft, selected }) {
  const typing = mode === 'api_typing';
  const choosing = mode === 'api_choose';
  return (
    <Box flexGrow={1} flexDirection="column" paddingX={1}>
      <Text dimColor>NIM API key (saved in config.json):</Text>
      <Box borderStyle="round" borderColor={typing ? 'cyan' : 'gray'} paddingX={1} marginTop={1}>
        <Text>{draft.length ? draft : '(empty)'}{typing ? '█' : ''}</Text>
      </Box>
      {choosing && (
        <Box marginTop={1}>
          <Text backgroundColor={selected === 0 ? 'cyan' : undefined} color={selected === 0 ? 'black' : undefined}> Save </Text>
          <Text>  </Text>
          <Text backgroundColor={selected === 1 ? 'cyan' : undefined} color={selected === 1 ? 'black' : undefined}> Cancel </Text>
        </Box>
      )}
    </Box>
  );
}

// Cap rendered rows so a long list doesn't overflow the panel height; keeps
// the selected row scrolled into view.
const VISIBLE_ROWS = 18;
function windowed(list, selected) {
  const start = Math.max(0, Math.min(selected - Math.floor(VISIBLE_ROWS / 2), Math.max(0, list.length - VISIBLE_ROWS)));
  return { start, items: list.slice(start, start + VISIBLE_ROWS) };
}

// ── Models tab — left: owned_by categories (API's own order); right: models
// for the selected category, A–Z. Enter on the right sets config.json's
// default_model, used by server.py when a tool call doesn't specify one. ──
function ModelsTab({ mode, loading, error, vendors, vendorSelected, vendorModels, modelSelected, defaultModel }) {
  if (loading) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text dimColor>Loading models from NVIDIA NIM…</Text>
      </Box>
    );
  }
  if (error) {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  const vendorWin = windowed(vendors, vendorSelected);
  const modelWin = windowed(vendorModels, modelSelected);

  return (
    <Box flexGrow={1}>
      <Box width="35%" borderStyle="single" borderColor={mode === 'left' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
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
      <Box width="65%" borderStyle="single" borderColor={mode === 'right' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
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

function ExitConfirm({ selected }) {
  return (
    <Box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
      <Text>Quit NIM MCP?</Text>
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

function Footer({ mode }) {
  let hint;
  if (mode === 'menu') hint = '[← →] switch tab  [Enter/↓] select  [Ctrl+C] quit';
  else if (mode === 'api_typing') hint = '[type] edit key  [Enter] continue to Save/Cancel  [Esc/Tab] back';
  else if (mode === 'api_choose') hint = '[← →] Save/Cancel  [Enter] confirm  [Esc/Tab] back';
  else if (mode === 'left') hint = '[↑↓] pick vendor  [→] models  [Esc/Tab] back';
  else if (mode === 'right') hint = '[↑↓] navigate  [Enter] set default  [←/Esc/Tab] back';
  else hint = '[Ctrl+C] quit';
  return (
    <Box paddingX={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState('api');
  // mode: 'menu' (tab bar focused) | 'left' | 'right' (panel focus) |
  //       'api_typing' (cursor in textbox) | 'api_choose' (Save/Cancel) | 'exit_confirm'
  const [mode, setMode] = useState('menu');
  const [exitConfirmSelected, setExitConfirmSelected] = useState(0);

  const [apiKeySaved, setApiKeySaved] = useState(loadConfig().api_key || '');
  const [apiKeyDraft, setApiKeyDraft] = useState(apiKeySaved);
  const [apiKeySelected, setApiKeySelected] = useState(0); // 0 = Save, 1 = Cancel

  const [models, setModels] = useState(null); // null = not fetched yet
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [vendorSelected, setVendorSelected] = useState(0);
  const [modelSelected, setModelSelected] = useState(0);
  const [defaultModel, setDefaultModel] = useState(loadConfig().default_model || '');

  // Fetch the model catalog once, the first time the MODELS tab is opened.
  // Category = owned_by, kept in the order the API returns it (no re-sorting).
  useEffect(() => {
    if (activeTab !== 'models' || models !== null || modelsLoading) return;
    const key = loadConfig().api_key;
    if (!key) {
      setModelsError('No API key set — go to the API tab and save one first.');
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
        setActiveTab('api');
        return;
      }
      if (key.return) {
        if (exitConfirmSelected === 0) {
          exit();
        } else {
          setMode('menu');
          setActiveTab('api');
        }
      }
      return;
    }

    // ── Tab / Esc: context-aware back navigation ─────────────────────────
    if (key.tab || key.escape) {
      if (mode === 'right') setMode('left');
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
        } else if (activeTab === 'api') {
          setApiKeyDraft(apiKeySaved);
          setMode('api_typing');
        } else {
          setMode('left');
        }
      }
      return;
    }

    // ── API key editor: stage 1 — typing, cursor lives in the textbox ────
    if (mode === 'api_typing') {
      if (key.return) {
        setApiKeySelected(0);
        setMode('api_choose');
        return;
      }
      if (key.backspace || key.delete) {
        setApiKeyDraft((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setApiKeyDraft((s) => s + input);
      }
      return;
    }

    // ── API key editor: stage 2 — Save / Cancel selection ────────────────
    if (mode === 'api_choose') {
      if (key.leftArrow || key.rightArrow) {
        setApiKeySelected((s) => (s === 0 ? 1 : 0));
        return;
      }
      if (key.return) {
        if (apiKeySelected === 0) {
          saveConfig({ api_key: apiKeyDraft });
          setApiKeySaved(apiKeyDraft);
        } else {
          setApiKeyDraft(apiKeySaved);
        }
        setMode('api_typing');
        return;
      }
      return;
    }

    // ── Left panel: vendor (owned_by) list ────────────────────────────────
    if (mode === 'left') {
      if (key.upArrow) setVendorSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) setVendorSelected((s) => Math.min(Math.max(0, vendors.length - 1), s + 1));
      if (key.rightArrow && vendorModels.length > 0) {
        setModelSelected(0);
        setMode('right');
      }
      return;
    }

    // ── Right panel: model list for the selected vendor ───────────────────
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
      <MenuBar activeTab={activeTab} mode={mode} defaultModel={defaultModel} />
      {mode === 'exit_confirm' && <ExitConfirm selected={exitConfirmSelected} />}
      {mode !== 'exit_confirm' && activeTab === 'api' && (
        <ApiTab mode={mode} draft={apiKeyDraft} selected={apiKeySelected} />
      )}
      {mode !== 'exit_confirm' && activeTab === 'models' && (
        <ModelsTab
          mode={mode}
          loading={modelsLoading}
          error={modelsError}
          vendors={vendors}
          vendorSelected={vendorSelected}
          vendorModels={vendorModels}
          modelSelected={modelSelected}
          defaultModel={defaultModel}
        />
      )}
      <Footer mode={mode} />
    </Box>
  );
}

render(<App />);
