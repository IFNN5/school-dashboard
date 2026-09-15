export function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

export function parseJSON(text) {
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

export function handleFileUpload(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    let teachers;
    if (file.name.endsWith('.csv')) {
      teachers = parseCSV(text);
    } else if (file.name.endsWith('.json')) {
      teachers = parseJSON(text);
    }
    callback(teachers);
  };
  reader.readAsText(file, 'UTF-8');
}