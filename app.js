const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_BOX = { width: 1600, height: 1000 };
const MIN_NODE_WIDTH = 130;
const MAX_NODE_WIDTH = 420;
const MIN_NODE_HEIGHT = 90;
const MAX_NODE_HEIGHT = 260;

const DEFAULT_THEME = {
  canvasBg: "#0e1420",
  gridColor: "#25334b",
  linkColor: "#78a8ff",
  nodeFill: "#182338",
  nodeStroke: "#4b6fa8",
  textColor: "#e9f1ff",
};

const TEMPLATE_LIBRARY = {
  server: { label: "Server", width: 210, height: 120, subtitle: "Compute Node", icon: "server" },
  router: { label: "Router", width: 200, height: 115, subtitle: "Gateway", icon: "router" },
  switch: { label: "Switch", width: 210, height: 112, subtitle: "Network Fabric", icon: "switch" },
  firewall: { label: "Firewall", width: 210, height: 116, subtitle: "Security Edge", icon: "firewall" },
  nas: { label: "NAS", width: 210, height: 124, subtitle: "Storage", icon: "nas" },
  vm: { label: "VM", width: 190, height: 108, subtitle: "Virtual Machine", icon: "vm" },
};

const state = {
  nextNodeId: 1,
  nextLinkId: 1,
  nodes: [],
  links: [],
  selectedNodeId: null,
  connectMode: false,
  linkStartNodeId: null,
  theme: { ...DEFAULT_THEME },
  interactionSession: null,
};

const refs = {
  svg: document.getElementById("diagramSvg"),
  canvasBackground: document.getElementById("canvasBackground"),
  gridPatternPath: document.getElementById("gridPatternPath"),
  nodesLayer: document.getElementById("nodesLayer"),
  linksLayer: document.getElementById("linksLayer"),
  statusText: document.getElementById("statusText"),
  connectModeBtn: document.getElementById("connectModeBtn"),
  newDiagramBtn: document.getElementById("newDiagramBtn"),
  deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
  exportPngBtn: document.getElementById("exportPngBtn"),
  applyThemeBtn: document.getElementById("applyThemeBtn"),
  resetThemeBtn: document.getElementById("resetThemeBtn"),
  selectionHint: document.getElementById("selectionHint"),
  nodeLabelInput: document.getElementById("nodeLabelInput"),
  nodeWidthInput: document.getElementById("nodeWidthInput"),
  nodeHeightInput: document.getElementById("nodeHeightInput"),
  nodeFillInput: document.getElementById("nodeFillInput"),
  nodeStrokeInput: document.getElementById("nodeStrokeInput"),
  nodeTextInput: document.getElementById("nodeTextInput"),
  themeCanvasBg: document.getElementById("themeCanvasBg"),
  themeGridColor: document.getElementById("themeGridColor"),
  themeLinkColor: document.getElementById("themeLinkColor"),
  themeNodeFill: document.getElementById("themeNodeFill"),
  themeNodeStroke: document.getElementById("themeNodeStroke"),
  themeTextColor: document.getElementById("themeTextColor"),
};

init();

function init() {
  bindPaletteDrag();
  bindCanvasInteractions();
  bindToolbar();
  bindInspector();
  bindThemeControls();
  applyThemeToCanvas();
  syncThemeInputs();
  updateInspector();
  render();
}

function bindPaletteDrag() {
  const items = document.querySelectorAll(".palette-item");
  for (const item of items) {
    item.addEventListener("dragstart", (event) => {
      const templateKey = item.dataset.template;
      if (!templateKey) {
        return;
      }
      event.dataTransfer.setData("text/plain", templateKey);
      event.dataTransfer.effectAllowed = "copy";
      setStatus("Drop on canvas to create a device card.");
    });
  }
}

function bindCanvasInteractions() {
  refs.svg.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  refs.svg.addEventListener("drop", (event) => {
    event.preventDefault();
    const templateKey = event.dataTransfer.getData("text/plain");
    if (!TEMPLATE_LIBRARY[templateKey]) {
      return;
    }
    const point = screenToSvg(event.clientX, event.clientY);
    addNodeFromTemplate(templateKey, point.x, point.y);
  });

  refs.svg.addEventListener("pointerdown", (event) => {
    const nodeGroup = event.target.closest(".node-group");
    if (!nodeGroup) {
      selectNode(null);
      return;
    }

    const nodeId = Number(nodeGroup.dataset.nodeId);
    if (!Number.isFinite(nodeId)) {
      return;
    }

    if (state.connectMode) {
      handleConnectClick(nodeId);
      return;
    }

    const node = getNodeById(nodeId);
    if (!node) {
      return;
    }

    selectNode(nodeId);
    const point = screenToSvg(event.clientX, event.clientY);
    const isResizeTarget = Boolean(event.target.closest(".resize-handle"));

    state.interactionSession = {
      type: isResizeTarget ? "resize" : "drag",
      nodeId,
      pointerStart: point,
      nodeStart: { x: node.x, y: node.y, width: node.width, height: node.height },
    };

    if (isResizeTarget) {
      setStatus("Resizing node. Drag corner to size it.");
    }

    nodeGroup.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  refs.svg.addEventListener("pointermove", (event) => {
    const session = state.interactionSession;
    if (!session) {
      return;
    }
    const node = getNodeById(session.nodeId);
    if (!node) {
      return;
    }

    const point = screenToSvg(event.clientX, event.clientY);
    const deltaX = point.x - session.pointerStart.x;
    const deltaY = point.y - session.pointerStart.y;

    if (session.type === "drag") {
      node.x = session.nodeStart.x + deltaX;
      node.y = session.nodeStart.y + deltaY;
    } else {
      const left = session.nodeStart.x - session.nodeStart.width / 2;
      const top = session.nodeStart.y - session.nodeStart.height / 2;
      node.width = clamp(session.nodeStart.width + deltaX, MIN_NODE_WIDTH, MAX_NODE_WIDTH);
      node.height = clamp(session.nodeStart.height + deltaY, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT);
      node.x = left + node.width / 2;
      node.y = top + node.height / 2;
    }

    constrainNode(node);
    if (node.id === state.selectedNodeId) {
      updateInspectorValues(node);
    }
    render();
  });

  refs.svg.addEventListener("dblclick", (event) => {
    const nodeGroup = event.target.closest(".node-group");
    if (!nodeGroup) {
      return;
    }
    const nodeId = Number(nodeGroup.dataset.nodeId);
    if (Number.isFinite(nodeId)) {
      renameNodeWithPrompt(nodeId);
    }
  });

  const stopInteraction = () => {
    state.interactionSession = null;
    updateInspector();
  };
  refs.svg.addEventListener("pointerup", stopInteraction);
  refs.svg.addEventListener("pointercancel", stopInteraction);
  window.addEventListener("pointerup", stopInteraction);
}

function bindToolbar() {
  refs.newDiagramBtn.addEventListener("click", () => {
    if (!window.confirm("Start a new empty diagram?")) {
      return;
    }
    state.nodes = [];
    state.links = [];
    state.selectedNodeId = null;
    state.linkStartNodeId = null;
    state.nextNodeId = 1;
    state.nextLinkId = 1;
    render();
    updateInspector();
    setStatus("New diagram created.");
  });

  refs.connectModeBtn.addEventListener("click", () => {
    state.connectMode = !state.connectMode;
    state.linkStartNodeId = null;
    refs.connectModeBtn.setAttribute("aria-pressed", String(state.connectMode));
    setStatus(
      state.connectMode
        ? "Connect mode on: click two nodes to link them."
        : "Connect mode off."
    );
  });

  refs.deleteSelectedBtn.addEventListener("click", () => {
    if (state.selectedNodeId === null) {
      return;
    }
    const nodeId = state.selectedNodeId;
    state.nodes = state.nodes.filter((node) => node.id !== nodeId);
    state.links = state.links.filter(
      (link) => link.fromNodeId !== nodeId && link.toNodeId !== nodeId
    );
    state.selectedNodeId = null;
    render();
    updateInspector();
    setStatus("Selected node deleted.");
  });

  refs.exportPngBtn.addEventListener("click", exportAsPng);
}

function bindInspector() {
  refs.nodeLabelInput.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.label = refs.nodeLabelInput.value.trim() || "Device";
    render();
  });

  refs.nodeWidthInput.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.width = Number(refs.nodeWidthInput.value);
    constrainNode(node);
    render();
  });

  refs.nodeHeightInput.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.height = Number(refs.nodeHeightInput.value);
    constrainNode(node);
    render();
  });

  refs.nodeFillInput.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.fill = refs.nodeFillInput.value;
    render();
  });

  refs.nodeStrokeInput.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.stroke = refs.nodeStrokeInput.value;
    render();
  });

  refs.nodeTextInput.addEventListener("input", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.textColor = refs.nodeTextInput.value;
    render();
  });
}

function bindThemeControls() {
  refs.themeCanvasBg.addEventListener("input", () => {
    state.theme.canvasBg = refs.themeCanvasBg.value;
    applyThemeToCanvas();
  });

  refs.themeGridColor.addEventListener("input", () => {
    state.theme.gridColor = refs.themeGridColor.value;
    applyThemeToCanvas();
  });

  refs.themeLinkColor.addEventListener("input", () => {
    state.theme.linkColor = refs.themeLinkColor.value;
    for (const link of state.links) {
      link.color = state.theme.linkColor;
    }
    render();
  });

  refs.themeNodeFill.addEventListener("input", () => {
    state.theme.nodeFill = refs.themeNodeFill.value;
  });

  refs.themeNodeStroke.addEventListener("input", () => {
    state.theme.nodeStroke = refs.themeNodeStroke.value;
  });

  refs.themeTextColor.addEventListener("input", () => {
    state.theme.textColor = refs.themeTextColor.value;
  });

  refs.applyThemeBtn.addEventListener("click", () => {
    for (const node of state.nodes) {
      node.fill = state.theme.nodeFill;
      node.stroke = state.theme.nodeStroke;
      node.textColor = state.theme.textColor;
    }
    for (const link of state.links) {
      link.color = state.theme.linkColor;
    }
    render();
    updateInspector();
    setStatus("Theme defaults applied to all nodes.");
  });

  refs.resetThemeBtn.addEventListener("click", () => {
    state.theme = { ...DEFAULT_THEME };
    syncThemeInputs();
    applyThemeToCanvas();
    render();
    setStatus("Theme reset to minimalist dark.");
  });
}

function addNodeFromTemplate(templateKey, x, y) {
  const template = TEMPLATE_LIBRARY[templateKey];
  if (!template) {
    return;
  }
  const node = {
    id: state.nextNodeId++,
    label: template.label,
    subtitle: template.subtitle,
    icon: template.icon,
    deviceType: templateKey,
    x,
    y,
    width: template.width,
    height: template.height,
    fill: state.theme.nodeFill,
    stroke: state.theme.nodeStroke,
    textColor: state.theme.textColor,
  };
  constrainNode(node);
  state.nodes.push(node);
  selectNode(node.id);
  render();
  setStatus(`${node.label} added.`);
}

function renameNodeWithPrompt(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) {
    return;
  }
  const next = window.prompt("Rename device", node.label);
  if (next === null) {
    return;
  }
  const label = next.trim();
  if (!label) {
    return;
  }
  node.label = label;
  if (node.id === state.selectedNodeId) {
    updateInspectorValues(node);
  }
  render();
  setStatus("Node renamed.");
}

function handleConnectClick(nodeId) {
  if (state.linkStartNodeId === null) {
    state.linkStartNodeId = nodeId;
    setStatus("Connection start selected. Click another node to finish.");
    return;
  }

  if (state.linkStartNodeId === nodeId) {
    setStatus("Pick a different node to complete the link.");
    return;
  }

  const existing = state.links.some(
    (link) =>
      (link.fromNodeId === state.linkStartNodeId && link.toNodeId === nodeId) ||
      (link.toNodeId === state.linkStartNodeId && link.fromNodeId === nodeId)
  );

  if (!existing) {
    state.links.push({
      id: state.nextLinkId++,
      fromNodeId: state.linkStartNodeId,
      toNodeId: nodeId,
      color: state.theme.linkColor,
    });
    setStatus("Nodes linked.");
  } else {
    setStatus("These nodes are already linked.");
  }

  state.linkStartNodeId = null;
  render();
}

function render() {
  renderLinks();
  renderNodes();
}

function renderNodes() {
  refs.nodesLayer.replaceChildren();
  for (const node of state.nodes) {
    const group = createSvgElement("g", { "data-node-id": String(node.id) }, "node-group");
    if (node.id === state.selectedNodeId) {
      group.classList.add("is-selected");
    }

    const left = node.x - node.width / 2;
    const top = node.y - node.height / 2;
    const padding = 14;
    const iconWrapSize = clamp(node.height * 0.42, 30, 46);
    const iconWrapX = left + padding;
    const iconWrapY = top + padding;

    const card = createSvgElement(
      "rect",
      {
        x: String(left),
        y: String(top),
        width: String(node.width),
        height: String(node.height),
        rx: "12",
        ry: "12",
        fill: node.fill,
        stroke: node.stroke,
        "stroke-width": "2",
      },
      "node-card"
    );
    group.appendChild(card);

    const iconWrap = createSvgElement(
      "rect",
      {
        x: String(iconWrapX),
        y: String(iconWrapY),
        width: String(iconWrapSize),
        height: String(iconWrapSize),
        rx: "8",
        ry: "8",
      },
      "node-icon-wrap"
    );
    group.appendChild(iconWrap);

    const icon = createDeviceIcon(
      node.icon || "server",
      iconWrapX + iconWrapSize / 2,
      iconWrapY + iconWrapSize / 2,
      iconWrapSize * 0.64,
      node.stroke
    );
    group.appendChild(icon);

    const title = createSvgElement(
      "text",
      {
        x: String(iconWrapX + iconWrapSize + 12),
        y: String(top + padding + 2),
        fill: node.textColor,
      },
      "node-title"
    );
    title.textContent = node.label;
    group.appendChild(title);

    const subtitle = createSvgElement(
      "text",
      {
        x: String(iconWrapX + iconWrapSize + 12),
        y: String(top + padding + 25),
        fill: node.textColor,
        opacity: "0.72",
      },
      "node-subtitle"
    );
    subtitle.textContent = node.subtitle || node.deviceType.toUpperCase();
    group.appendChild(subtitle);

    const handle = createSvgElement(
      "rect",
      {
        x: String(left + node.width - 13),
        y: String(top + node.height - 13),
        width: "10",
        height: "10",
        rx: "2",
        ry: "2",
      },
      "resize-handle"
    );
    group.appendChild(handle);

    refs.nodesLayer.appendChild(group);
  }
}

function renderLinks() {
  refs.linksLayer.replaceChildren();
  for (const link of state.links) {
    const fromNode = getNodeById(link.fromNodeId);
    const toNode = getNodeById(link.toNodeId);
    if (!fromNode || !toNode) {
      continue;
    }
    const line = createSvgElement(
      "line",
      {
        x1: String(fromNode.x),
        y1: String(fromNode.y),
        x2: String(toNode.x),
        y2: String(toNode.y),
        stroke: link.color || state.theme.linkColor,
      },
      "link-line"
    );
    refs.linksLayer.appendChild(line);
  }
}

function createDeviceIcon(iconType, cx, cy, size, color) {
  const group = createSvgElement("g", {}, "node-icon-stroke");
  group.setAttribute("stroke", color);
  const half = size / 2;

  if (iconType === "server") {
    group.appendChild(
      createSvgElement("rect", {
        x: String(cx - half),
        y: String(cy - half + 1),
        width: String(size),
        height: String(size - 2),
        rx: "3",
        ry: "3",
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx - half + 4),
        y1: String(cy - 1),
        x2: String(cx + half - 4),
        y2: String(cy - 1),
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx - half + 4),
        y1: String(cy + 6),
        x2: String(cx + half - 4),
        y2: String(cy + 6),
      })
    );
    return group;
  }

  if (iconType === "router") {
    group.appendChild(
      createSvgElement("circle", { cx: String(cx), cy: String(cy + 2), r: String(size * 0.24) })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx),
        y1: String(cy - half + 1),
        x2: String(cx),
        y2: String(cy - size * 0.02),
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx - size * 0.26),
        y1: String(cy + size * 0.14),
        x2: String(cx + size * 0.26),
        y2: String(cy + size * 0.14),
      })
    );
    return group;
  }

  if (iconType === "switch") {
    group.appendChild(
      createSvgElement("rect", {
        x: String(cx - half),
        y: String(cy - size * 0.26),
        width: String(size),
        height: String(size * 0.52),
        rx: "2",
        ry: "2",
      })
    );
    const step = size / 4.8;
    for (let i = -1.5; i <= 1.5; i += 1) {
      group.appendChild(
        createSvgElement("circle", {
          cx: String(cx + i * step),
          cy: String(cy),
          r: String(size * 0.05),
        })
      );
    }
    return group;
  }

  if (iconType === "firewall") {
    group.appendChild(
      createSvgElement("rect", {
        x: String(cx - half),
        y: String(cy - half),
        width: String(size),
        height: String(size),
        rx: "2",
        ry: "2",
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx - half),
        y1: String(cy),
        x2: String(cx + half),
        y2: String(cy),
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx - size * 0.17),
        y1: String(cy - half),
        x2: String(cx - size * 0.17),
        y2: String(cy),
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx + size * 0.17),
        y1: String(cy),
        x2: String(cx + size * 0.17),
        y2: String(cy + half),
      })
    );
    return group;
  }

  if (iconType === "nas") {
    group.appendChild(
      createSvgElement("ellipse", {
        cx: String(cx),
        cy: String(cy - size * 0.2),
        rx: String(size * 0.32),
        ry: String(size * 0.12),
      })
    );
    group.appendChild(
      createSvgElement("ellipse", {
        cx: String(cx),
        cy: String(cy + size * 0.12),
        rx: String(size * 0.32),
        ry: String(size * 0.12),
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx - size * 0.32),
        y1: String(cy - size * 0.2),
        x2: String(cx - size * 0.32),
        y2: String(cy + size * 0.12),
      })
    );
    group.appendChild(
      createSvgElement("line", {
        x1: String(cx + size * 0.32),
        y1: String(cy - size * 0.2),
        x2: String(cx + size * 0.32),
        y2: String(cy + size * 0.12),
      })
    );
    return group;
  }

  group.appendChild(
    createSvgElement("rect", {
      x: String(cx - half),
      y: String(cy - half),
      width: String(size),
      height: String(size),
      rx: "3",
      ry: "3",
    })
  );
  group.appendChild(
    createSvgElement("line", {
      x1: String(cx - half + 4),
      y1: String(cy - half + 8),
      x2: String(cx + half - 4),
      y2: String(cy - half + 8),
    })
  );
  return group;
}

function createSvgElement(tag, attributes = {}, className = "") {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  if (className) {
    element.setAttribute("class", className);
  }
  return element;
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  updateInspector();
  render();
}

function updateInspector() {
  const node = getSelectedNode();
  const disabled = !node;

  refs.nodeLabelInput.disabled = disabled;
  refs.nodeWidthInput.disabled = disabled;
  refs.nodeHeightInput.disabled = disabled;
  refs.nodeFillInput.disabled = disabled;
  refs.nodeStrokeInput.disabled = disabled;
  refs.nodeTextInput.disabled = disabled;

  if (!node) {
    refs.selectionHint.textContent = "Select a node to edit it. Double-click node title to rename.";
    refs.nodeLabelInput.value = "";
    refs.nodeWidthInput.value = String(MIN_NODE_WIDTH);
    refs.nodeHeightInput.value = String(MIN_NODE_HEIGHT);
    return;
  }

  refs.selectionHint.textContent = `Editing node #${node.id}. Drag corner to resize.`;
  updateInspectorValues(node);
}

function updateInspectorValues(node) {
  refs.nodeLabelInput.value = node.label;
  refs.nodeWidthInput.value = String(node.width);
  refs.nodeHeightInput.value = String(node.height);
  refs.nodeFillInput.value = node.fill;
  refs.nodeStrokeInput.value = node.stroke;
  refs.nodeTextInput.value = node.textColor;
}

function applyThemeToCanvas() {
  refs.canvasBackground.setAttribute("fill", state.theme.canvasBg);
  refs.gridPatternPath.setAttribute("stroke", state.theme.gridColor);
  refs.gridPatternPath.setAttribute("stroke-width", "1");
}

function syncThemeInputs() {
  refs.themeCanvasBg.value = state.theme.canvasBg;
  refs.themeGridColor.value = state.theme.gridColor;
  refs.themeLinkColor.value = state.theme.linkColor;
  refs.themeNodeFill.value = state.theme.nodeFill;
  refs.themeNodeStroke.value = state.theme.nodeStroke;
  refs.themeTextColor.value = state.theme.textColor;
}

function exportAsPng() {
  const serializer = new XMLSerializer();
  const svgMarkup = serializer.serializeToString(refs.svg);
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = VIEW_BOX.width;
    canvas.height = VIEW_BOX.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = state.theme.canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    URL.revokeObjectURL(blobUrl);

    const pngUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = "homelab-diagram.png";
    a.click();
    setStatus("PNG exported.");
  };

  image.onerror = () => {
    URL.revokeObjectURL(blobUrl);
    setStatus("Export failed. Try again.");
  };

  image.src = blobUrl;
}

function screenToSvg(clientX, clientY) {
  const point = refs.svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = refs.svg.getScreenCTM();
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function setStatus(text) {
  refs.statusText.textContent = text;
}

function getNodeById(id) {
  return state.nodes.find((node) => node.id === id) || null;
}

function getSelectedNode() {
  if (state.selectedNodeId === null) {
    return null;
  }
  return getNodeById(state.selectedNodeId);
}

function constrainNode(node) {
  const halfWidth = Math.max(35, node.width / 2);
  const halfHeight = Math.max(35, node.height / 2);
  node.x = clamp(node.x, halfWidth, VIEW_BOX.width - halfWidth);
  node.y = clamp(node.y, halfHeight, VIEW_BOX.height - halfHeight);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
