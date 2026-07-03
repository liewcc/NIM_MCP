import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  const defaultCfg = { default_model: 'z-ai/glm-5.2', active_tab: 'chat' };
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultCfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to create default config.json:', e.message);
  }
}

const TABS = ['chat', 'models', 'exit'];

// ── Menu bar — same convention as Gemi_MCP_V2: highlighted tab = active mode ─
const MenuBar = React.memo(function MenuBar({ activeTab, mode }) {
  const isMenu = mode === 'menu';
  return (
    <Box flexDirection="row" paddingX={1} marginTop={0}>
      <Text
        color={activeTab === 'chat' ? (isMenu ? 'black' : 'cyan') : 'gray'}
        backgroundColor={isMenu && activeTab === 'chat' ? 'cyan' : undefined}
        bold={!isMenu && activeTab === 'chat'}
      >
        {' CHAT '}
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

// ── Generic left/right two-panel row — focus border follows mode ────────────
function TwoPanelRow({ left, right, mode }) {
  return (
    <Box flexGrow={1}>
      <Box width="35%" borderStyle="single" borderColor={mode === 'left' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
        {left}
      </Box>
      <Box width="65%" borderStyle="single" borderColor={mode === 'right' ? 'cyan' : 'gray'} paddingX={1} flexDirection="column">
        {right}
      </Box>
    </Box>
  );
}

function ChatTab({ mode }) {
  return (
    <TwoPanelRow
      mode={mode}
      left={<Text dimColor>Model picker / recent prompts — not wired up yet</Text>}
      right={<Text dimColor>Response viewer — not wired up yet</Text>}
    />
  );
}

function ModelsTab({ mode }) {
  return (
    <TwoPanelRow
      mode={mode}
      left={<Text dimColor>Category filter — not wired up yet</Text>}
      right={<Text dimColor>Model catalog (list_models) — not wired up yet</Text>}
    />
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
  else if (mode === 'left') hint = '[↑↓] navigate  [→] next panel  [Esc/Tab] back';
  else if (mode === 'right') hint = '[←/Esc/Tab] back  [Ctrl+C] quit';
  else hint = '[Ctrl+C] quit';
  return (
    <Box paddingX={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState('chat');
  // mode: 'menu' (tab bar focused) | 'left' | 'right' (panel focus) | 'exit_confirm'
  const [mode, setMode] = useState('menu');
  const [exitConfirmSelected, setExitConfirmSelected] = useState(0);

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
        setActiveTab('chat');
        return;
      }
      if (key.return) {
        if (exitConfirmSelected === 0) {
          exit();
        } else {
          setMode('menu');
          setActiveTab('chat');
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
        } else {
          setMode('left');
        }
      }
      return;
    }

    // ── Left panel ───────────────────────────────────────────────────────
    if (mode === 'left') {
      if (key.rightArrow) setMode('right');
      return;
    }

    // ── Right panel ──────────────────────────────────────────────────────
    if (mode === 'right') {
      if (key.leftArrow) setMode('left');
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <MenuBar activeTab={activeTab} mode={mode} />
      {mode === 'exit_confirm' && <ExitConfirm selected={exitConfirmSelected} />}
      {mode !== 'exit_confirm' && activeTab === 'chat' && <ChatTab mode={mode} />}
      {mode !== 'exit_confirm' && activeTab === 'models' && <ModelsTab mode={mode} />}
      <Footer mode={mode} />
    </Box>
  );
}

render(<App />);
