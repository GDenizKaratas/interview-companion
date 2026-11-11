// Files the Interviewer chose or dropped to add Candidates from. A file chosen or dropped by itself
// is always kept, so core can say why it cannot be added. From a folder only the PDF files are
// taken, and the others are counted, so the list is not filled with a folder's other files.
export interface PickedFiles {
  files: File[];
  // Files of a folder that were left out because they are not PDFs.
  ignored: number;
}

export function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf");
}

// The files of a folder chosen with the folder chooser.
export function pdfsOfFolder(files: Iterable<File>): PickedFiles {
  return fromFolder([...files].map((file) => ({ file, path: file.webkitRelativePath || file.name })));
}

// What was dropped: files as they are, and folders read to the end, with their PDF files only.
// It must be called while the drop event is handled, since the browser forgets the dropped items
// afterwards. Where folders cannot be read, the dropped files are taken as they are.
export function readDrop(data: DataTransfer): Promise<PickedFiles> {
  const items = [...data.items].filter((item) => item.kind === "file");
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
  if (items.length === 0 || entries.some((entry) => entry === null)) {
    return Promise.resolve({ files: [...data.files], ignored: 0 });
  }
  return Promise.all(
    (entries as FileSystemEntry[]).map(async (entry): Promise<PickedFiles> => {
      if (entry.isFile) return { files: [await fileOf(entry as FileSystemFileEntry)], ignored: 0 };
      return fromFolder(await filesIn(entry as FileSystemDirectoryEntry));
    }),
  ).then((parts) => ({ files: parts.flatMap((part) => part.files), ignored: parts.reduce((n, part) => n + part.ignored, 0) }));
}

interface FolderFile {
  file: File;
  path: string;
}

// The PDFs of a folder in the order of their paths, as a file browser shows them. Hidden files,
// such as those the system leaves in a folder, are neither taken nor counted.
function fromFolder(found: FolderFile[]): PickedFiles {
  const visible = found.filter(({ file }) => !file.name.startsWith("."));
  const pdfs = visible
    .filter(({ file }) => isPdfFile(file))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return { files: pdfs.map(({ file }) => file), ignored: visible.length - pdfs.length };
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// Every file under a folder, in its subfolders too. A part that cannot be read is left out.
async function filesIn(folder: FileSystemDirectoryEntry): Promise<FolderFile[]> {
  const found: FolderFile[] = [];
  for (const entry of await entriesOf(folder)) {
    if (entry.isDirectory) found.push(...(await filesIn(entry as FileSystemDirectoryEntry)));
    else if (entry.isFile) {
      const file = await fileOf(entry as FileSystemFileEntry).catch(() => null);
      if (file) found.push({ file, path: entry.fullPath });
    }
  }
  return found;
}

// A folder gives its entries in batches; an empty batch means there are no more.
async function entriesOf(folder: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = folder.createReader();
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}
