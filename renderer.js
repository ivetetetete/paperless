const toolbar = document.getElementById('toolbar');
const notesContainer = document.getElementById('notes-container');
const btnNewNote = document.getElementById('btn-new-note');
const btnToggleVisibility = document.getElementById('btn-toggle-visibility');
const btnHistory = document.getElementById('btn-history');
const historyBadge = document.getElementById('history-badge');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const btnSnapshotAll = document.getElementById('btn-snapshot-all');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnQuit = document.getElementById('btn-quit');
const slashMenu = document.getElementById('slash-menu');
const slashMenuList = document.getElementById('slash-menu-list');

const TOOLBAR_POS_KEY = 'paperless-toolbar-pos';
const MAX_HISTORY_ITEMS = 50;

const COLORS = ['yellow', 'pink', 'blue', 'green', 'purple'];
const DEFAULT_WIDTH = 270;
const DEFAULT_HEIGHT = 260;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 110;

let notes = [];
let noteHistory = [];
let historyOpen = false;
let highestZIndex = 10;
let notesVisible = true;
let isDraggingAny = false;
let saveTimeout = null;

const MOD_KEY = window.stickyAPI.platform === 'darwin' ? 'Cmd' : 'Ctrl';

const SLASH_COMMANDS = [
  {
    id: 'todo',
    title: 'Lista de tareas',
    desc: 'Casillas de verificación interactivas',
    icon: '☑',
    keywords: 'todo tarea check checkbox casilla lista'
  },
  {
    id: 'bullet',
    title: 'Lista con viñetas',
    desc: 'Crear una lista simple con puntos',
    icon: '•',
    keywords: 'lista vinetas bullet puntos ul'
  },
  {
    id: 'number',
    title: 'Lista numerada',
    desc: 'Crear una lista ordenada con números',
    icon: '1.',
    keywords: 'lista numerada numeros orden ol'
  },
  {
    id: 'h1',
    title: 'Título 1',
    desc: 'Encabezado de sección grande',
    icon: 'H1',
    keywords: 'h1 titulo encabezado grande'
  },
  {
    id: 'h2',
    title: 'Subtítulo 2',
    desc: 'Encabezado de sección mediano',
    icon: 'H2',
    keywords: 'h2 subtitulo encabezado mediano'
  },
  {
    id: 'bold',
    title: 'Negrita',
    desc: `Resaltar texto en negrita (${MOD_KEY}+B)`,
    icon: 'B',
    keywords: 'negrita bold b fuerte'
  },
  {
    id: 'italic',
    title: 'Cursiva',
    desc: `Texto en estilo cursiva (${MOD_KEY}+I)`,
    icon: 'I',
    keywords: 'cursiva italic i'
  },
  {
    id: 'underline',
    title: 'Subrayado',
    desc: `Subrayar el texto actual (${MOD_KEY}+U)`,
    icon: 'U',
    keywords: 'subrayado underline u'
  },
  {
    id: 'strike',
    title: 'Tachado',
    desc: 'Tachar el texto seleccionado',
    icon: 'S',
    keywords: 'tachado strike s'
  },
  {
    id: 'quote',
    title: 'Cita',
    desc: 'Destacar una nota o frase',
    icon: '❝',
    keywords: 'cita quote bloque'
  },
  {
    id: 'divider',
    title: 'Separador',
    desc: 'Dividir visualmente con una línea',
    icon: '―',
    keywords: 'separador linea divider hr'
  },
  {
    id: 'text',
    title: 'Texto normal',
    desc: 'Volver al formato de párrafo normal',
    icon: 'T',
    keywords: 'texto normal parrafo p'
  }
];

let slashState = {
  open: false,
  activeEditor: null,
  activeNoteData: null,
  activeTriggerBtn: null,
  savedRange: null,
  textNode: null,
  slashIndex: -1,
  caretOffset: -1,
  filteredCommands: [],
  selectedIndex: 0
};

async function init() {
  notes = await window.stickyAPI.loadNotes();
  const loadedHistory = await window.stickyAPI.loadHistory();
  noteHistory = Array.isArray(loadedHistory) ? loadedHistory : [];

  if (!Array.isArray(notes) || notes.length === 0) {
    notes = [
      {
        id: crypto.randomUUID(),
        content:
          '<h2>¡Hola! 👋</h2>' +
          '<div>Escribe <b>/</b> o pulsa <b>/ Comandos</b> para insertar bloques de estilo.</div>' +
          '<div>💾 <b>Tus notas se guardan solas en tu ordenador</b> aunque cierres la app o apagues el equipo, y si cierras alguna con <b>✕</b> puedes recuperarla desde el icono de <b>Historial</b> en la barra.</div>' +
          '<div class="todo-item" data-checked="false">Probar la lista de tareas con Enter</div>' +
          '<div class="todo-item completed" data-checked="true">Redimensionar desde la esquina inferior derecha</div>',
        color: 'yellow',
        x: 120,
        y: 100,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        zIndex: 1
      }
    ];
    await saveNotesImmediate();
  }

  notes.forEach((n) => {
    if (n.zIndex && n.zIndex >= highestZIndex) {
      highestZIndex = n.zIndex + 1;
    }
  });

  renderAllNotes();
  renderHistory();
  setupToolbarDraggable();
  setupClickThroughHandling();
  updateLinuxWindowShape();
  requestAnimationFrame(() => updateLinuxWindowShape());
  window.addEventListener('load', () => updateLinuxWindowShape());

  window.addEventListener('blur', () => {
    if (slashState.open) closeSlashMenu();
    if (historyOpen) closeHistoryPanel();
  });

  window.addEventListener('beforeunload', () => {
    window.stickyAPI.saveNotes(notes);
    window.stickyAPI.saveHistory(noteHistory);
  });

  document.addEventListener('selectionchange', () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains('note-content')) {
      const noteEl = activeEl.closest('.note');
      if (noteEl) {
        updateFormatBarState(noteEl, activeEl);
      }
    }
  });
}

function scheduleSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    window.stickyAPI.saveNotes(notes);
  }, 250);
}

async function saveNotesImmediate() {
  clearTimeout(saveTimeout);
  await window.stickyAPI.saveNotes(notes);
}

function normalizeContentToHTML(rawContent) {
  if (!rawContent) return '';
  const hasHTMLTags = /<[a-z][\s\S]*>/i.test(rawContent);
  if (hasHTMLTags) return rawContent;
  return rawContent
    .split('\n')
    .map((line) => `<div>${line || '<br>'}</div>`)
    .join('');
}

function upgradeLegacyTodos(editor) {
  const todoItems = editor.querySelectorAll('.todo-item');
  todoItems.forEach((item) => {
    const legacyCheckbox = item.querySelector('.todo-checkbox');
    const legacySpan = item.querySelector('.todo-text');
    if (legacyCheckbox || legacySpan) {
      const isChecked =
        item.classList.contains('completed') ||
        (legacyCheckbox && (legacyCheckbox.checked || legacyCheckbox.hasAttribute('checked')));
      const text = legacySpan ? legacySpan.innerHTML : item.textContent;
      item.innerHTML = text || '<br>';
      item.setAttribute('data-checked', isChecked ? 'true' : 'false');
      item.classList.toggle('completed', Boolean(isChecked));
    }
  });
}

function renderAllNotes() {
  notesContainer.innerHTML = '';
  notes.forEach((noteData) => {
    const noteEl = createNoteElement(noteData);
    notesContainer.appendChild(noteEl);
  });
  updateLinuxWindowShape();
}

function createNoteElement(noteData) {
  const noteEl = document.createElement('div');
  noteEl.className = 'note interactive';
  noteEl.dataset.id = noteData.id;
  noteEl.dataset.color = noteData.color || 'yellow';
  noteEl.style.left = `${noteData.x}px`;
  noteEl.style.top = `${noteData.y}px`;
  noteEl.style.width = `${noteData.width || DEFAULT_WIDTH}px`;
  noteEl.style.height = `${noteData.height || DEFAULT_HEIGHT}px`;
  noteEl.style.zIndex = noteData.zIndex || 1;
  noteEl.addEventListener('animationend', () => updateLinuxWindowShape());

  const header = document.createElement('div');
  header.className = 'note-header';

  const palette = document.createElement('div');
  palette.className = 'color-palette';

  COLORS.forEach((color) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot';
    dot.dataset.color = color;
    dot.title = `Cambiar a ${color}`;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      noteData.color = color;
      noteEl.dataset.color = color;
      scheduleSave();
    });
    palette.appendChild(dot);
  });

  const btnDelete = document.createElement('button');
  btnDelete.className = 'btn-delete';
  btnDelete.innerHTML = '✕';
  btnDelete.title = 'Eliminar nota';
  btnDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteNote(noteData.id, noteEl);
  });

  header.appendChild(palette);
  header.appendChild(btnDelete);

  const editor = document.createElement('div');
  editor.className = 'note-content';
  editor.contentEditable = 'true';
  editor.dataset.placeholder = "Escribe una nota o pulsa '/' para comandos...";
  editor.innerHTML = normalizeContentToHTML(noteData.content);
  upgradeLegacyTodos(editor);

  const formatBar = createFormatBar(noteEl, editor, noteData);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'note-resize-handle';
  resizeHandle.title = 'Arrastrar para cambiar el tamaño';

  setupRichEditorEvents(noteEl, editor, noteData);

  noteEl.addEventListener('mousedown', () => {
    bringToFront(noteData, noteEl);
  });

  setupDraggable(noteEl, header, noteData);
  setupResizable(noteEl, resizeHandle, noteData);

  noteEl.appendChild(header);
  noteEl.appendChild(editor);
  noteEl.appendChild(formatBar);
  noteEl.appendChild(resizeHandle);

  updateResponsiveFormatBar(
    noteEl,
    noteData.width || DEFAULT_WIDTH,
    noteData.height || DEFAULT_HEIGHT
  );

  return noteEl;
}

function createFormatBar(noteEl, editor, noteData) {
  const bar = document.createElement('div');
  bar.className = 'note-format-bar';

  const buttons = [
    { label: '<b>B</b>', title: `Negrita (${MOD_KEY}+B)`, cmd: 'bold', minWidth: 135 },
    { label: '<i>I</i>', title: `Cursiva (${MOD_KEY}+I)`, cmd: 'italic', minWidth: 162 },
    { label: '<u>U</u>', title: `Subrayado (${MOD_KEY}+U)`, cmd: 'underline', minWidth: 190 },
    { label: '<s>S</s>', title: 'Tachado', cmd: 'strike', minWidth: 216 },
    { label: '•', title: 'Lista con viñetas', cmd: 'bullet', minWidth: 242 },
    { label: '☑', title: 'Lista de tareas', cmd: 'todo', minWidth: 266 }
  ];

  buttons.forEach((btnInfo) => {
    const btn = document.createElement('button');
    btn.className = 'format-btn';
    btn.dataset.cmd = btnInfo.cmd;
    btn.dataset.minWidth = String(btnInfo.minWidth);
    btn.innerHTML = btnInfo.label;
    btn.title = btnInfo.title;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      editor.focus();
      executeCommand(btnInfo.cmd, editor, noteData);
      updateFormatBarState(noteEl, editor);
    });
    bar.appendChild(btn);
  });

  const slashBtn = document.createElement('button');
  slashBtn.className = 'format-btn slash-trigger';
  slashBtn.textContent = '/ Comandos';
  slashBtn.title = 'Abrir menú de acciones (/)';
  slashBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (slashState.open && slashState.activeTriggerBtn === slashBtn) {
      closeSlashMenu();
      return;
    }

    openSlashMenuFromButton(editor, noteData, slashBtn);
  });

  bar.appendChild(slashBtn);
  return bar;
}

function updateResponsiveFormatBar(noteEl, width, height) {
  const formatBar = noteEl.querySelector('.note-format-bar');
  if (!formatBar) return;

  const isTooShort = height < 135;
  formatBar.classList.toggle('is-collapsed', isTooShort);
  if (isTooShort) return;

  const formatButtons = formatBar.querySelectorAll('.format-btn[data-min-width]');
  formatButtons.forEach((btn) => {
    const minW = Number(btn.dataset.minWidth || 0);
    btn.classList.toggle('is-collapsed', width < minW);
  });

  const slashBtn = formatBar.querySelector('.slash-trigger');
  if (slashBtn) {
    slashBtn.textContent = width < 195 ? '/' : '/ Comandos';
    slashBtn.classList.toggle('is-collapsed', width < 128);
  }
}

function updateFormatBarState(noteEl, editor) {
  if (!noteEl || !editor) return;

  const states = {
    bold: safeQueryCommandState('bold'),
    italic: safeQueryCommandState('italic'),
    underline: safeQueryCommandState('underline'),
    strike: safeQueryCommandState('strikeThrough'),
    bullet: safeQueryCommandState('insertUnorderedList'),
    todo: Boolean(getCurrentTodoItem(editor))
  };

  const buttons = noteEl.querySelectorAll('.format-btn[data-cmd]');
  buttons.forEach((btn) => {
    const cmd = btn.dataset.cmd;
    btn.classList.toggle('active', Boolean(states[cmd]));
  });
}

function safeQueryCommandState(command) {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function setupRichEditorEvents(noteEl, editor, noteData) {
  editor.addEventListener('input', () => {
    noteData.content = editor.innerHTML;
    scheduleSave();
    checkSlashTrigger(editor, noteData);
    updateFormatBarState(noteEl, editor);
  });

  editor.addEventListener('keyup', () => {
    updateFormatBarState(noteEl, editor);
  });

  editor.addEventListener('mouseup', () => {
    updateFormatBarState(noteEl, editor);
  });

  editor.addEventListener('mousedown', (e) => {
    const todoItem = e.target.closest('.todo-item');
    if (todoItem && editor.contains(todoItem)) {
      const rect = todoItem.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX >= 0 && clickX <= 22) {
        e.preventDefault();
        const isChecked = todoItem.getAttribute('data-checked') === 'true';
        const nextState = !isChecked;
        todoItem.setAttribute('data-checked', nextState ? 'true' : 'false');
        todoItem.classList.toggle('completed', nextState);
        noteData.content = editor.innerHTML;
        scheduleSave();
      }
    }
  });

  editor.addEventListener('keydown', (e) => {
    if (slashState.open && slashState.activeEditor === editor) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (slashState.filteredCommands.length > 0) {
          slashState.selectedIndex =
            (slashState.selectedIndex + 1) % slashState.filteredCommands.length;
          renderSlashMenuItems();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (slashState.filteredCommands.length > 0) {
          slashState.selectedIndex =
            (slashState.selectedIndex - 1 + slashState.filteredCommands.length) %
            slashState.filteredCommands.length;
          renderSlashMenuItems();
        }
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (slashState.filteredCommands.length > 0) {
          e.preventDefault();
          const chosen = slashState.filteredCommands[slashState.selectedIndex];
          applySlashCommand(chosen.id);
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeSlashMenu();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const todoItem = getCurrentTodoItem(editor);
      if (todoItem) {
        e.preventDefault();
        const plainText = todoItem.textContent.replace(/\u200B/g, '').trim();

        if (!plainText) {
          todoItem.classList.remove('todo-item', 'completed');
          todoItem.removeAttribute('data-checked');
          todoItem.innerHTML = '<br>';
          placeCaretAtStart(todoItem);
        } else {
          const sel = window.getSelection();
          const newTodo = document.createElement('div');
          newTodo.className = 'todo-item';
          newTodo.setAttribute('data-checked', 'false');

          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const afterRange = range.cloneRange();
            afterRange.selectNodeContents(todoItem);
            afterRange.setStart(range.endContainer, range.endOffset);
            const trailingFragment = afterRange.extractContents();

            if (trailingFragment.textContent.trim() || trailingFragment.querySelector('*')) {
              newTodo.appendChild(trailingFragment);
            } else {
              newTodo.innerHTML = '<br>';
            }

            if (!todoItem.textContent.trim()) {
              todoItem.innerHTML = '<br>';
            }
          } else {
            newTodo.innerHTML = '<br>';
          }

          todoItem.after(newTodo);
          placeCaretAtStart(newTodo);
        }

        noteData.content = editor.innerHTML;
        scheduleSave();
        updateFormatBarState(noteEl, editor);
        return;
      }
    }

    if (e.key === 'Backspace') {
      const todoItem = getCurrentTodoItem(editor);
      if (todoItem && isCaretAtStartOfElement(todoItem)) {
        e.preventDefault();
        todoItem.classList.remove('todo-item', 'completed');
        todoItem.removeAttribute('data-checked');
        noteData.content = editor.innerHTML;
        scheduleSave();
        updateFormatBarState(noteEl, editor);
      }
    }
  });
}

function getCurrentTodoItem(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.anchorNode;
  if (!node || !editor.contains(node)) return null;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return el ? el.closest('.todo-item') : null;
}

function isCaretAtStartOfElement(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length === 0;
}

function placeCaretAtStart(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function toggleTodoOnCurrentLine(editor) {
  const existingTodo = getCurrentTodoItem(editor);
  if (existingTodo) {
    existingTodo.classList.remove('todo-item', 'completed');
    existingTodo.removeAttribute('data-checked');
    return;
  }

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
    const todo = document.createElement('div');
    todo.className = 'todo-item';
    todo.setAttribute('data-checked', 'false');
    todo.innerHTML = '<br>';
    editor.appendChild(todo);
    placeCaretAtStart(todo);
    return;
  }

  let node = sel.anchorNode;
  if (node === editor || (node.nodeType === Node.TEXT_NODE && node.parentNode === editor)) {
    const todo = document.createElement('div');
    todo.className = 'todo-item';
    todo.setAttribute('data-checked', 'false');

    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent;
      todo.textContent = textContent || '';
      if (!todo.textContent) todo.innerHTML = '<br>';
      node.replaceWith(todo);
      placeCaretAtEnd(todo);
    } else {
      todo.innerHTML = '<br>';
      editor.appendChild(todo);
      placeCaretAtStart(todo);
    }
    return;
  }

  let block = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (block && block.parentElement !== editor && block !== editor) {
    block = block.parentElement;
  }

  if (block && block !== editor) {
    block.classList.add('todo-item');
    block.setAttribute('data-checked', 'false');
    if (!block.textContent.trim() && !block.querySelector('br')) {
      block.innerHTML = '<br>';
    }
    placeCaretAtEnd(block);
  } else {
    const todo = document.createElement('div');
    todo.className = 'todo-item';
    todo.setAttribute('data-checked', 'false');
    todo.innerHTML = '<br>';
    editor.appendChild(todo);
    placeCaretAtStart(todo);
  }
}

function checkSlashTrigger(editor, noteData) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) {
    closeSlashMenu();
    return;
  }

  const range = sel.getRangeAt(0);
  const container = range.startContainer;

  if (container.nodeType !== Node.TEXT_NODE) {
    closeSlashMenu();
    return;
  }

  const textBeforeCaret = container.textContent.slice(0, range.startOffset);
  const match = textBeforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]*)$/);

  if (!match) {
    closeSlashMenu();
    return;
  }

  const query = match[1].toLowerCase();
  const slashIndex = textBeforeCaret.lastIndexOf('/');

  const filtered = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.title.toLowerCase().includes(query) ||
      cmd.id.toLowerCase().includes(query) ||
      cmd.keywords.toLowerCase().includes(query)
  );

  if (slashState.activeTriggerBtn) {
    slashState.activeTriggerBtn.classList.remove('active');
  }

  slashState = {
    open: true,
    activeEditor: editor,
    activeNoteData: noteData,
    activeTriggerBtn: null,
    savedRange: range.cloneRange(),
    textNode: container,
    slashIndex,
    caretOffset: range.startOffset,
    filteredCommands: filtered,
    selectedIndex: 0
  };

  const rect = range.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const x = rect.left || editorRect.left + 16;
  const y = rect.bottom || editorRect.top + 36;
  positionAndShowSlashMenu(x, y);
}

function openSlashMenuFromButton(editor, noteData, buttonEl) {
  editor.focus();

  const sel = window.getSelection();
  let savedRange = null;
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  } else {
    placeCaretAtEnd(editor);
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  if (slashState.activeTriggerBtn) {
    slashState.activeTriggerBtn.classList.remove('active');
  }
  buttonEl.classList.add('active');

  slashState = {
    open: true,
    activeEditor: editor,
    activeNoteData: noteData,
    activeTriggerBtn: buttonEl,
    savedRange,
    textNode: null,
    slashIndex: -1,
    caretOffset: -1,
    filteredCommands: [...SLASH_COMMANDS],
    selectedIndex: 0
  };

  const rect = buttonEl.getBoundingClientRect();
  positionAndShowSlashMenu(rect.left - 140, rect.top - 280);
}

function positionAndShowSlashMenu(x, y) {
  renderSlashMenuItems();
  slashMenu.style.display = 'block';

  const menuWidth = 230;
  const menuHeight = 270;
  const clampedX = Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12));
  const clampedY = Math.max(12, Math.min(y + 6, window.innerHeight - menuHeight - 12));

  slashMenu.style.left = `${clampedX}px`;
  slashMenu.style.top = `${clampedY}px`;
  updateLinuxWindowShape();
}

function renderSlashMenuItems() {
  slashMenuList.innerHTML = '';

  if (slashState.filteredCommands.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'slash-empty';
    empty.textContent = 'Sin resultados';
    slashMenuList.appendChild(empty);
    return;
  }

  slashState.filteredCommands.forEach((cmd, idx) => {
    const item = document.createElement('button');
    item.className = `slash-item ${idx === slashState.selectedIndex ? 'active' : ''}`;
    item.innerHTML = `
      <span class="slash-item-icon">${cmd.icon}</span>
      <span class="slash-item-info">
        <span class="slash-item-title">${cmd.title}</span>
        <span class="slash-item-desc">${cmd.desc}</span>
      </span>
    `;

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      applySlashCommand(cmd.id);
    });

    slashMenuList.appendChild(item);
  });

  const activeItem = slashMenuList.querySelector('.slash-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
}

function closeSlashMenu() {
  if (slashState.activeTriggerBtn) {
    slashState.activeTriggerBtn.classList.remove('active');
    slashState.activeTriggerBtn = null;
  }
  if (!slashState.open) return;
  slashState.open = false;
  slashMenu.style.display = 'none';
  updateLinuxWindowShape();
}

function applySlashCommand(cmdId) {
  const { activeEditor, activeNoteData, savedRange, textNode, slashIndex, caretOffset } = slashState;
  if (!activeEditor) return;

  activeEditor.focus();

  if (textNode && slashIndex >= 0 && textNode.parentNode) {
    const range = document.createRange();
    const safeEnd = Math.min(caretOffset, textNode.textContent.length);
    range.setStart(textNode, slashIndex);
    range.setEnd(textNode, safeEnd);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false, null);
  } else if (savedRange) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  closeSlashMenu();
  executeCommand(cmdId, activeEditor, activeNoteData);

  const noteEl = activeEditor.closest('.note');
  if (noteEl) {
    updateFormatBarState(noteEl, activeEditor);
  }
}

function executeCommand(cmdId, editor, noteData) {
  editor.focus();

  switch (cmdId) {
    case 'bold':
      document.execCommand('bold', false, null);
      break;
    case 'italic':
      document.execCommand('italic', false, null);
      break;
    case 'underline':
      document.execCommand('underline', false, null);
      break;
    case 'strike':
      document.execCommand('strikeThrough', false, null);
      break;
    case 'bullet':
      document.execCommand('insertUnorderedList', false, null);
      break;
    case 'number':
      document.execCommand('insertOrderedList', false, null);
      break;
    case 'h1':
      document.execCommand('formatBlock', false, 'H1');
      break;
    case 'h2':
      document.execCommand('formatBlock', false, 'H2');
      break;
    case 'quote':
      document.execCommand('formatBlock', false, 'BLOCKQUOTE');
      break;
    case 'text': {
      const todo = getCurrentTodoItem(editor);
      if (todo) {
        todo.classList.remove('todo-item', 'completed');
        todo.removeAttribute('data-checked');
      }
      document.execCommand('formatBlock', false, 'DIV');
      break;
    }
    case 'divider':
      document.execCommand('insertHorizontalRule', false, null);
      break;
    case 'todo':
      toggleTodoOnCurrentLine(editor);
      break;
  }

  noteData.content = editor.innerHTML;
  scheduleSave();
}

window.addEventListener('mousedown', (e) => {
  if (
    slashState.open &&
    !e.target.closest('#slash-menu') &&
    !e.target.closest('.slash-trigger')
  ) {
    closeSlashMenu();
  }
  if (
    historyOpen &&
    !e.target.closest('#history-panel') &&
    !e.target.closest('#btn-history')
  ) {
    closeHistoryPanel();
  }
});

function addNewNote() {
  const offset = (notes.length % 8) * 28;
  const randomColor = COLORS[notes.length % COLORS.length];

  const newNote = {
    id: crypto.randomUUID(),
    content: '',
    color: randomColor,
    x: 100 + offset,
    y: 90 + offset,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    zIndex: ++highestZIndex
  };

  notes.push(newNote);
  const noteEl = createNoteElement(newNote);
  notesContainer.appendChild(noteEl);
  updateLinuxWindowShape();

  const editor = noteEl.querySelector('.note-content');
  if (editor) editor.focus();

  scheduleSave();
}

function getPlainTextFromHTML(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html || '';
  return (temp.textContent || temp.innerText || '').trim();
}

function addNoteToHistory(noteData, reason = 'Eliminada') {
  const plainText = getPlainTextFromHTML(noteData.content);
  if (!plainText) return;

  const entry = {
    historyId: crypto.randomUUID(),
    noteId: noteData.id,
    content: noteData.content,
    preview: plainText,
    color: noteData.color || 'yellow',
    width: noteData.width || DEFAULT_WIDTH,
    height: noteData.height || DEFAULT_HEIGHT,
    x: noteData.x ?? 120,
    y: noteData.y ?? 100,
    reason,
    savedAt: new Date().toISOString()
  };

  noteHistory.unshift(entry);
  if (noteHistory.length > MAX_HISTORY_ITEMS) {
    noteHistory = noteHistory.slice(0, MAX_HISTORY_ITEMS);
  }
  window.stickyAPI.saveHistory(noteHistory);
  renderHistory();
}

function formatHistoryDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_e) {
    return '';
  }
}

function positionHistoryPanel() {
  if (!toolbar || !historyPanel || !historyOpen) return;
  const rect = toolbar.getBoundingClientRect();
  const panelWidth = 320;
  const panelHeight = Math.min(historyPanel.offsetHeight || 280, 400);

  let left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
  let top = rect.bottom + 10;

  if (top + panelHeight > window.innerHeight - 8) {
    top = Math.max(8, rect.top - panelHeight - 10);
  }

  historyPanel.style.left = `${Math.round(left)}px`;
  historyPanel.style.top = `${Math.round(top)}px`;
  updateLinuxWindowShape();
}

function toggleHistoryPanel() {
  historyOpen = !historyOpen;
  btnHistory.classList.toggle('active', historyOpen);
  if (historyOpen) {
    closeSlashMenu();
    renderHistory();
    historyPanel.style.display = 'flex';
    positionHistoryPanel();
  } else {
    historyPanel.style.display = 'none';
    updateLinuxWindowShape();
  }
}

function closeHistoryPanel() {
  if (!historyOpen) return;
  historyOpen = false;
  btnHistory.classList.remove('active');
  historyPanel.style.display = 'none';
  updateLinuxWindowShape();
}

function restoreNoteFromHistory(historyId) {
  const index = noteHistory.findIndex((item) => item.historyId === historyId);
  if (index === -1) return;

  const entry = noteHistory[index];
  const offset = (notes.length % 6) * 20;
  const maxX = Math.max(0, window.innerWidth - (entry.width || DEFAULT_WIDTH));
  const maxY = Math.max(0, window.innerHeight - (entry.height || DEFAULT_HEIGHT));

  const restoredNote = {
    id: crypto.randomUUID(),
    content: entry.content,
    color: entry.color || 'yellow',
    x: Math.max(20, Math.min((entry.x ?? 120) + offset, maxX)),
    y: Math.max(20, Math.min((entry.y ?? 100) + offset, maxY)),
    width: entry.width || DEFAULT_WIDTH,
    height: entry.height || DEFAULT_HEIGHT,
    zIndex: ++highestZIndex
  };

  notes.push(restoredNote);
  const noteEl = createNoteElement(restoredNote);
  notesContainer.appendChild(noteEl);

  if (!notesVisible) {
    btnToggleVisibility.click();
  }

  noteHistory.splice(index, 1);
  window.stickyAPI.saveHistory(noteHistory);
  scheduleSave();
  renderHistory();
  updateLinuxWindowShape();
}

function removeHistoryItem(historyId) {
  noteHistory = noteHistory.filter((item) => item.historyId !== historyId);
  window.stickyAPI.saveHistory(noteHistory);
  renderHistory();
}

function renderHistory() {
  if (!historyList || !historyBadge) return;

  if (noteHistory.length > 0) {
    historyBadge.textContent = String(noteHistory.length);
    historyBadge.style.display = 'inline-flex';
  } else {
    historyBadge.style.display = 'none';
  }

  historyList.innerHTML = '';

  if (noteHistory.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent =
      'No hay notas en el historial. Cuando cierres una nota con texto o pulses "+ Guardar copia", aparecerá aquí para que puedas recuperarla.';
    historyList.appendChild(empty);
    updateLinuxWindowShape();
    return;
  }

  noteHistory.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const top = document.createElement('div');
    top.className = 'history-item-top';

    const meta = document.createElement('div');
    meta.className = 'history-item-meta';

    const dot = document.createElement('span');
    dot.className = 'history-color-dot';
    dot.setAttribute('data-color', item.color || 'yellow');

    const dateSpan = document.createElement('span');
    dateSpan.textContent = `${item.reason || 'Guardada'} · ${formatHistoryDate(item.savedAt)}`;

    meta.appendChild(dot);
    meta.appendChild(dateSpan);

    const btns = document.createElement('div');
    btns.className = 'history-item-btns';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn-restore-note';
    restoreBtn.textContent = 'Restaurar';
    restoreBtn.addEventListener('click', () => restoreNoteFromHistory(item.historyId));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-history';
    removeBtn.title = 'Eliminar del historial';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeHistoryItem(item.historyId));

    btns.appendChild(restoreBtn);
    btns.appendChild(removeBtn);

    top.appendChild(meta);
    top.appendChild(btns);

    const preview = document.createElement('div');
    preview.className = 'history-item-preview';
    preview.textContent = item.preview || getPlainTextFromHTML(item.content) || '(Nota sin texto)';

    row.appendChild(top);
    row.appendChild(preview);
    historyList.appendChild(row);
  });

  updateLinuxWindowShape();
}

function deleteNote(id, noteEl) {
  if (slashState.open && slashState.activeNoteData?.id === id) {
    closeSlashMenu();
  }
  const targetNote = notes.find((n) => n.id === id);
  if (targetNote) {
    addNoteToHistory(targetNote, 'Cerrada');
  }
  notes = notes.filter((n) => n.id !== id);
  noteEl.remove();
  scheduleSave();
  updateLinuxWindowShape();
}

function bringToFront(noteData, noteEl) {
  highestZIndex += 1;
  noteData.zIndex = highestZIndex;
  noteEl.style.zIndex = highestZIndex;
  scheduleSave();
}

function setupToolbarDraggable() {
  if (!toolbar) return;

  const clampToolbarPosition = (x, y) => {
    const maxX = Math.max(0, window.innerWidth - toolbar.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - toolbar.offsetHeight);
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY))
    };
  };

  try {
    const saved = JSON.parse(localStorage.getItem(TOOLBAR_POS_KEY) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      const pos = clampToolbarPosition(saved.x, saved.y);
      toolbar.style.left = `${pos.x}px`;
      toolbar.style.top = `${pos.y}px`;
    }
  } catch (_e) {}

  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  toolbar.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;

    closeSlashMenu();
    isDraggingAny = true;
    toolbar.classList.add('dragging');
    updateLinuxWindowShape();

    const rect = toolbar.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = rect.left;
    initialTop = rect.top;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const pos = clampToolbarPosition(initialLeft + dx, initialTop + dy);

      toolbar.style.left = `${pos.x}px`;
      toolbar.style.top = `${pos.y}px`;
      if (historyOpen) positionHistoryPanel();
    };

    const onMouseUp = () => {
      isDraggingAny = false;
      toolbar.classList.remove('dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      updateLinuxWindowShape();

      const finalRect = toolbar.getBoundingClientRect();
      try {
        localStorage.setItem(
          TOOLBAR_POS_KEY,
          JSON.stringify({ x: Math.round(finalRect.left), y: Math.round(finalRect.top) })
        );
      } catch (_e) {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  window.addEventListener('resize', () => {
    const rect = toolbar.getBoundingClientRect();
    const pos = clampToolbarPosition(rect.left, rect.top);
    toolbar.style.left = `${pos.x}px`;
    toolbar.style.top = `${pos.y}px`;
    if (historyOpen) positionHistoryPanel();
    updateLinuxWindowShape();
  });
}

function setupDraggable(noteEl, handleEl, noteData) {
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  handleEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;

    closeSlashMenu();
    isDraggingAny = true;
    noteEl.classList.add('dragging');
    updateLinuxWindowShape();

    startX = e.clientX;
    startY = e.clientY;
    initialLeft = noteData.x;
    initialTop = noteData.y;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      const maxX = window.innerWidth - noteEl.offsetWidth;
      const maxY = window.innerHeight - noteEl.offsetHeight;

      noteData.x = Math.max(0, Math.min(initialLeft + dx, maxX));
      noteData.y = Math.max(0, Math.min(initialTop + dy, maxY));

      noteEl.style.left = `${noteData.x}px`;
      noteEl.style.top = `${noteData.y}px`;
    };

    const onMouseUp = () => {
      isDraggingAny = false;
      noteEl.classList.remove('dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scheduleSave();
      updateLinuxWindowShape();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

function setupResizable(noteEl, resizeHandleEl, noteData) {
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;

  resizeHandleEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    closeSlashMenu();
    isDraggingAny = true;
    noteEl.classList.add('resizing');
    updateLinuxWindowShape();

    startX = e.clientX;
    startY = e.clientY;
    startWidth = noteEl.offsetWidth;
    startHeight = noteEl.offsetHeight;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      const maxWidth = window.innerWidth - noteData.x - 8;
      const maxHeight = window.innerHeight - noteData.y - 8;

      const newWidth = Math.max(MIN_WIDTH, Math.min(startWidth + dx, maxWidth));
      const newHeight = Math.max(MIN_HEIGHT, Math.min(startHeight + dy, maxHeight));

      noteData.width = newWidth;
      noteData.height = newHeight;

      noteEl.style.width = `${newWidth}px`;
      noteEl.style.height = `${newHeight}px`;
      updateResponsiveFormatBar(noteEl, newWidth, newHeight);
    };

    const onMouseUp = () => {
      isDraggingAny = false;
      noteEl.classList.remove('resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      scheduleSave();
      updateLinuxWindowShape();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

function updateLinuxWindowShape() {
  if (window.stickyAPI.platform !== 'linux' || !window.stickyAPI.setWindowShape) return;

  if (isDraggingAny) {
    window.stickyAPI.setWindowShape([
      {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      }
    ]);
    return;
  }

  const rects = [];
  const pad = 4;
  const elements = document.querySelectorAll('.interactive');

  elements.forEach((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (el.closest('#notes-container') && !notesVisible) return;

    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width <= 0 || height <= 0) return;

    const left = el.offsetLeft;
    const top = el.offsetTop;

    rects.push({
      x: Math.max(0, Math.floor(left - pad)),
      y: Math.max(0, Math.floor(top - pad)),
      width: Math.ceil(width + pad * 2),
      height: Math.ceil(height + pad * 2)
    });
  });

  window.stickyAPI.setWindowShape(rects);
}

function setupClickThroughHandling() {
  if (window.stickyAPI.platform === 'linux') {
    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('.interactive') && window.stickyAPI.focusWindow) {
        window.stickyAPI.focusWindow();
      }
    });
    return;
  }

  let lastIgnoreState = true;

  window.addEventListener('mousemove', (e) => {
    if (isDraggingAny) {
      if (lastIgnoreState !== false) {
        lastIgnoreState = false;
        window.stickyAPI.setIgnoreMouse(false);
      }
      return;
    }

    const isOverInteractive = Boolean(e.target.closest('.interactive'));
    const shouldIgnore = !isOverInteractive;

    if (shouldIgnore !== lastIgnoreState) {
      lastIgnoreState = shouldIgnore;
      window.stickyAPI.setIgnoreMouse(shouldIgnore);
    }
  });
}

btnNewNote.addEventListener('click', addNewNote);

const iconEyeOpen = document.getElementById('icon-eye-open');
const iconEyeClosed = document.getElementById('icon-eye-closed');

btnToggleVisibility.addEventListener('click', () => {
  notesVisible = !notesVisible;
  if (!notesVisible) closeSlashMenu();
  notesContainer.style.display = notesVisible ? 'block' : 'none';

  iconEyeOpen.style.display = notesVisible ? 'block' : 'none';
  iconEyeClosed.style.display = notesVisible ? 'none' : 'block';

  btnToggleVisibility.classList.toggle('is-visible', notesVisible);
  btnToggleVisibility.classList.toggle('is-hidden', !notesVisible);
  btnToggleVisibility.title = notesVisible ? 'Ocultar notas' : 'Mostrar notas';
  updateLinuxWindowShape();
});

btnHistory.addEventListener('click', toggleHistoryPanel);

btnSnapshotAll.addEventListener('click', () => {
  notes.forEach((n) => addNoteToHistory(n, 'Copia'));
});

btnClearHistory.addEventListener('click', () => {
  noteHistory = [];
  window.stickyAPI.saveHistory(noteHistory);
  renderHistory();
});

btnQuit.addEventListener('click', async () => {
  await saveNotesImmediate();
  await window.stickyAPI.saveHistory(noteHistory);
  window.stickyAPI.quitApp();
});

init();
