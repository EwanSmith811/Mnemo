import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import * as ppt from 'ppt-codec';
import { readCompoundFile } from 'archive-codec';

function blockText(block) {
  if (block.kind === 'paragraph')
    return block.runs.map((run) => run.text || '').join('');
  if (block.kind === 'table')
    return block.rows
      .map((row) =>
        row.cells
          .map((cell) => cell.blocks.map(blockText).join('\n'))
          .join('\t'),
      )
      .join('\n');
  return '';
}
function textFromPresentation(presentation) {
  return presentation.slides
    .map((slide, index) => {
      const body = slide.shapes
        .flatMap((shape) => shape.blocks || [])
        .map(blockText)
        .filter(Boolean)
        .join('\n');
      if (!body.trim() && !slide.notes?.trim()) return '';
      return [
        'Slide ' + (index + 1),
        body,
        slide.notes ? 'Speaker notes: ' + slide.notes : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function atomText(record) {
  if (record.header.recType === ppt.RT_TextCharsAtom) {
    if (record.data.length % 2)
      throw new Error('Incomplete UTF-16 PowerPoint text.');
    return Buffer.from(record.data).toString('utf16le');
  }
  if (record.header.recType === ppt.RT_TextBytesAtom) {
    // MS-PPT compressed Unicode: the high byte of each UTF-16 code unit is zero.
    return Buffer.from(record.data).toString('latin1');
  }
  return '';
}

// Read text from active slide records without interpreting graphics properties,
// fonts, images, or text styling. The normal reader remains the preferred path.
// Persist-directory resolution avoids recovering superseded/deleted slides.
function extractTextOnly(bytes) {
  const streams = readCompoundFile(bytes);
  const stream = (name) => {
    const found = streams.find((entry) => entry.path === name);
    if (!found) throw new Error('Required PowerPoint stream is missing.');
    return found.bytes;
  };
  const currentUser = ppt.readCurrentUserAtom(stream('Current User'));
  if (currentUser.encrypted)
    throw new Error('Password-protected PowerPoint is not supported.');
  const documentStream = stream('PowerPoint Document');
  const { directory, currentEdit } = ppt.buildPersistDirectory(
    documentStream,
    currentUser.offsetToCurrentEdit,
  );
  const resolve = (id) =>
    ppt.resolvePersistObject(
      documentStream,
      directory,
      id,
      'Active PowerPoint text',
    );
  const document = resolve(currentEdit.docPersistIdRef);
  if (document.header.recType !== ppt.RT_Document)
    throw new Error('Invalid PowerPoint document record.');
  const lists = ppt.childRecords(document);
  const slideList = lists.find(
    (record) =>
      record.header.recType === ppt.RT_SlideListWithText &&
      record.header.recInstance === 0,
  );
  if (!slideList) return '';
  const slides = ppt.readSlideListWithText(slideList);
  const notesList = lists.find(
    (record) =>
      record.header.recType === ppt.RT_SlideListWithText &&
      record.header.recInstance === 2,
  );
  let examined = 0;

  function collect(root, outlines = []) {
    const pieces = [],
      referenced = new Set();
    const stack = [{ record: root, depth: 0 }];
    while (stack.length) {
      const { record, depth } = stack.pop();
      if (++examined > 100000 || depth > 128)
        throw new Error('PowerPoint record limits exceeded.');
      const type = record.header.recType;
      if (type === ppt.RT_OutlineTextRefAtom) {
        if (record.data.length < 4)
          throw new Error('Incomplete PowerPoint text reference.');
        const index = new DataView(
          record.data.buffer,
          record.data.byteOffset,
          record.data.byteLength,
        ).getUint32(0, true);
        if (!outlines[index])
          throw new Error('Invalid PowerPoint text reference.');
        if (!referenced.has(index)) pieces.push(outlines[index]);
        referenced.add(index);
      } else {
        const text = atomText(record);
        if (text) pieces.push(text);
      }
      const children =
        type === ppt.OfficeArtClientTextbox
          ? ppt.readRecordSequence(
              record.stream,
              record.dataOffset,
              record.dataOffset + record.data.length,
            )
          : ppt.childRecords(record);
      for (let i = children.length - 1; i >= 0; i--)
        stack.push({ record: children[i], depth: depth + 1 });
    }
    outlines.forEach((text, index) => {
      if (text && !referenced.has(index)) pieces.push(text);
    });
    return pieces
      .join('\n')
      .replace(/[\r\v]/g, '\n')
      .trim();
  }

  const notes = new Map();
  if (notesList) {
    for (const persist of ppt.readNotesListWithText(notesList)) {
      const container = resolve(persist.persistIdRef);
      const { slideIdRef } = ppt.readNotesContainerAtom(container);
      notes.set(slideIdRef, collect(container));
    }
  }
  return slides
    .map((slide, index) => {
      const record = resolve(slide.persistIdRef);
      if (record.header.recType !== ppt.RT_Slide)
        throw new Error('Invalid PowerPoint slide record.');
      const outlines = slide.texts.map((text) =>
        text.records.map(atomText).filter(Boolean).join('\n'),
      );
      const body = collect(record, outlines),
        note = notes.get(slide.slideId);
      if (!body && !note) return '';
      return [
        'Slide ' + (index + 1),
        body,
        note ? 'Speaker notes: ' + note : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function extractPresentationText(bytes) {
  try {
    return textFromPresentation(ppt.readPptContent(bytes));
  } catch (error) {
    if (
      error.name !== 'PptFormatError' &&
      error.name !== 'PptUnsupportedContentError'
    )
      throw error;
    return extractTextOnly(bytes);
  }
}

if (!isMainThread) {
  try {
    parentPort.postMessage({
      text: extractPresentationText(new Uint8Array(workerData.buffer)),
    });
  } catch {
    parentPort.postMessage({ error: true });
  }
}
export { extractPresentationText, extractTextOnly };
