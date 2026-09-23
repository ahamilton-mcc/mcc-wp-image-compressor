const MAX_BYTES = 800 * 1024; // 800KB target
const MAX_DIMENSION = 2000;   // longest side, in pixels
const MIN_DIMENSION = 500;    // don't shrink dimensions past this
const MIN_QUALITY = 0.5;      // don't drop JPEG quality below this

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const chooseBtn = document.getElementById('chooseBtn');
const resultsSection = document.getElementById('results');
const fileList = document.getElementById('fileList');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const clearBtn = document.getElementById('clearBtn');

const processedFiles = []; // { name, url }

chooseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

['dragenter', 'dragover'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  })
);
dropzone.addEventListener('drop', (e) => {
  handleFiles(e.dataTransfer.files);
});

clearBtn.addEventListener('click', () => {
  fileList.innerHTML = '';
  processedFiles.length = 0;
  resultsSection.hidden = true;
  downloadAllBtn.hidden = true;
  fileInput.value = '';
});

downloadAllBtn.addEventListener('click', () => {
  processedFiles.forEach((f, i) => {
    setTimeout(() => triggerDownload(f.url, f.name), i * 200);
  });
});

function handleFiles(fileListInput) {
  const files = Array.from(fileListInput).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  resultsSection.hidden = false;
  files.forEach(processFile);
}

async function processFile(file) {
  const row = buildRow(file);
  fileList.appendChild(row.el);

  try {
    const { blob, width, height, quality } = await compressImage(file);
    const url = URL.createObjectURL(blob);
    const outName = renameToJpg(file.name);

    row.thumb.src = url;
    row.newSize.textContent = formatBytes(blob.size);
    row.status.textContent = `${width}×${height} @ q${Math.round(quality * 100)}`;
    row.downloadLink.href = url;
    row.downloadLink.download = outName;
    row.downloadLink.hidden = false;
    row.spinnerText.hidden = true;

    processedFiles.push({ name: outName, url });
    if (processedFiles.length > 1) downloadAllBtn.hidden = false;
  } catch (err) {
    row.el.classList.add('error');
    row.status.textContent = 'Could not process';
    row.spinnerText.hidden = true;
    console.error(err);
  }
}

function buildRow(file) {
  const el = document.createElement('li');
  el.className = 'file-row';

  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.alt = '';

  const info = document.createElement('div');
  info.className = 'info';

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = file.name;

  const sizes = document.createElement('div');
  sizes.className = 'sizes';
  const origSize = document.createElement('span');
  origSize.textContent = formatBytes(file.size);
  const arrow = document.createTextNode(' → ');
  const newSize = document.createElement('span');
  newSize.className = 'new-size';
  newSize.textContent = '…';
  sizes.append(origSize, arrow, newSize);

  info.append(name, sizes);

  const status = document.createElement('div');
  status.className = 'status';
  const spinnerText = document.createElement('span');
  spinnerText.textContent = 'Working…';
  status.appendChild(spinnerText);

  const downloadLink = document.createElement('a');
  downloadLink.className = 'download';
  downloadLink.textContent = 'Download';
  downloadLink.hidden = true;

  el.append(thumb, info, status, downloadLink);

  return { el, thumb, newSize, status, spinnerText, downloadLink };
}

function renameToJpg(name) {
  const dot = name.lastIndexOf('.');
  const base = dot > -1 ? name.slice(0, dot) : name;
  return `${base}.jpg`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function triggerDownload(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function encode(img, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // flatten transparency (e.g. PNGs) onto white
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

async function compressImage(file) {
  const img = await loadImage(file);

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  let quality = 0.9;
  let blob = await encode(img, width, height, quality);

  // Step 1: reduce quality until under the target, or we hit the quality floor.
  while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    blob = await encode(img, width, height, quality);
  }

  // Step 2: still too big — shrink dimensions and retry the quality ramp.
  while (blob.size > MAX_BYTES && width > MIN_DIMENSION && height > MIN_DIMENSION) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    quality = 0.85;
    blob = await encode(img, width, height, quality);
    while (blob.size > MAX_BYTES && quality > MIN_QUALITY) {
      quality = Math.round((quality - 0.1) * 10) / 10;
      blob = await encode(img, width, height, quality);
    }
  }

  return { blob, width, height, quality };
}
