export function editableTextBoxHeight(label: string, width: number, minimum = 120) {
  const usableWidth = Math.max(80, width - 40);
  const charactersPerLine = Math.max(8, Math.floor(usableWidth / 12));
  const lines = label.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return Math.max(minimum, 38 + lines * 27);
}
