export function escapeHTML(text: string) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(text));

  return div.innerHTML;
}

function getScrollbarDimensions() {
  const div = document.createElement("div");
  div.style.width = "100px";
  div.style.height = "100px";
  div.style.overflow = "scroll";
  div.style.position = "absolute";
  div.style.top = "-9999px";
  document.body.appendChild(div);

  const scrollbarWidth = div.offsetWidth - div.clientWidth;
  const scrollbarHeight = div.offsetHeight - div.clientHeight;

  document.body.removeChild(div);

  return { scrollbarWidth, scrollbarHeight };
}

export function getAdjustedPopupPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  const { scrollbarWidth, scrollbarHeight } = getScrollbarDimensions();
  const margin = 16;

  const rightEdge = window.innerWidth + window.scrollX - width - scrollbarWidth - margin;
  const bottomEdge = document.body.clientHeight - height - scrollbarHeight - margin;

  return [Math.max(0, Math.min(x, rightEdge)), Math.max(0, Math.min(y, bottomEdge))];
}
