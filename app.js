const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_BOX = { width: 1600, height: 1000 };

const DEFAULT_THEME = {
  canvasBg: "#0e1420",
  gridColor: "#25334b",
  linkColor: "#78a8ff",
  nodeFill: "#182338",
  nodeStroke: "#4b6fa8",
  textColor: "#e9f1ff",
};

const TEMPLATE_LIBRARY = {
  server: { label: "Server", shape: "rect", width: 160, height: 84 },
  router: { label: "Router", shape: "circle", width: 120, height: 120 },
  switch: { label: "Switch", shape: "rect", width: 190, height: 64 },
  firewall: { label: "Firewall", shape: "diamond", width: 140, height: 95 },
  nas: { label: "NAS", shape: "rect", width: 145, height: 92 },
  vm: { label: "VM", shape: "rect", width: 120, height: 70 },
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
  dragSession: null,
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
  nodeShapeInput: document.getElementById("nodeShapeInput"),
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
      const template = item.dataset.template;
      if (!template) {
        return;
      }
      event.dataTransfer.setData("text/plain", template);
      event.dataTransfer.effectAllowed = "copy";
      setStatus("Drop on canvas to create a node.");
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
    const template = TEMPLATE_LIBRARY[templateKey];
    if (!template) {
      return;
    }
    const point = screenToSvg(event.clientX, event.clientY);
    addNodeFromTemplate(template, point.x, point.y);
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

    selectNode(nodeId);
    const point = screenToSvg(event.clientX, event.clientY);
    const node = getNodeById(nodeId);
    state.dragSession = {
      nodeId,
      pointerStart: point,
      nodeStart: { x: node.x, y: node.y },
    };

    nodeGroup.setPointerCapture(event.pointerId);
  });

  refs.svg.addEventListener("pointermove", (event) => {
    if (!state.dragSession) {
      return;
    }
    const session = state.dragSession;
    const node = getNodeById(session.nodeId);
    if (!node) {
      return;
    }
    const point = screenToSvg(event.clientX, event.clientY);
    const deltaX = point.x - session.pointerStart.x;
    const deltaY = point.y - session.pointerStart.y;
    node.x = session.nodeStart.x + deltaX;
    node.y = session.nodeStart.y + deltaY;
    constrainNode(node);
    render();
  });

  const clearDrag = () => {
    state.dragSession = null;
  };
  refs.svg.addEventListener("pointerup", clearDrag);
  refs.svg.addEventListener("pointercancel", clearDrag);
  window.addEventListener("pointerup", clearDrag);
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
    state.nodes = state.nodes.filter((n) => n.id !== nodeId);
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
    node.label = refs.nodeLabelInput.value.trim() || "Node";
    render();
  });

  refs.nodeShapeInput.addEventListener("change", () => {
    const node = getSelectedNode();
    if (!node) {
      return;
    }
    node.shape = refs.nodeShapeInput.value;
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

function addNodeFromTemplate(template, x, y) {
  const node = {
    id: state.nextNodeId++,
    label: template.label,
    shape: template.shape,
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
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("node-group");
    if (node.id === state.selectedNodeId) {
      group.classList.add("is-selected");
    }
    group.dataset.nodeId = String(node.id);

    const shape = createShape(node);
    shape.classList.add("node-shape");
    shape.setAttribute("fill", node.fill);
    shape.setAttribute("stroke", node.stroke);
    shape.setAttribute("stroke-width", "2");
    group.appendChild(shape);

    const label = document.createElementNS(SVG_NS, "text");
    label.classList.add("node-label");
    label.setAttribute("x", String(node.x));
    label.setAttribute("y", String(node.y));
    label.setAttribute("fill", node.textColor);
    label.textContent = node.label;
    group.appendChild(label);

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
    const line = document.createElementNS(SVG_NS, "line");
    line.classList.add("link-line");
    line.setAttribute("x1", String(fromNode.x));
    line.setAttribute("y1", String(fromNode.y));
    line.setAttribute("x2", String(toNode.x));
    line.setAttribute("y2", String(toNode.y));
    line.setAttribute("stroke", link.color || state.theme.linkColor);
    refs.linksLayer.appendChild(line);
  }
}

function createShape(node) {
  if (node.shape === "circle") {
    const circle = document.createElementNS(SVG_NS, "ellipse");
    circle.setAttribute("cx", String(node.x));
    circle.setAttribute("cy", String(node.y));
    circle.setAttribute("rx", String(Math.max(28, node.width / 2)));
    circle.setAttribute("ry", String(Math.max(28, node.height / 2)));
    return circle;
  }

  if (node.shape === "diamond") {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    polygon.setAttribute(
      "points",
      [
        `${node.x},${node.y - halfH}`,
        `${node.x + halfW},${node.y}`,
        `${node.x},${node.y + halfH}`,
        `${node.x - halfW},${node.y}`,
      ].join(" ")
    );
    return polygon;
  }

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(node.x - node.width / 2));
  rect.setAttribute("y", String(node.y - node.height / 2));
  rect.setAttribute("width", String(node.width));
  rect.setAttribute("height", String(node.height));
  rect.setAttribute("rx", "9");
  rect.setAttribute("ry", "9");
  return rect;
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
  refs.nodeShapeInput.disabled = disabled;
  refs.nodeWidthInput.disabled = disabled;
  refs.nodeHeightInput.disabled = disabled;
  refs.nodeFillInput.disabled = disabled;
  refs.nodeStrokeInput.disabled = disabled;
  refs.nodeTextInput.disabled = disabled;

  if (!node) {
    refs.selectionHint.textContent = "Select a node to edit it.";
    refs.nodeLabelInput.value = "";
    return;
  }

  refs.selectionHint.textContent = `Editing node #${node.id}`;
  refs.nodeLabelInput.value = node.label;
  refs.nodeShapeInput.value = node.shape;
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
