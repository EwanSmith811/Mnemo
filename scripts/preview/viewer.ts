import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@aiden0z/pptx-renderer';
const root = document.getElementById('slide')!;
let viewer: PptxViewer | undefined;
let height = 540;
let zoom = 1;
let serial = Promise.resolve();
window.addEventListener('message', (event) => {
  if (event.source !== parent) return;
  if (event.data?.type === 'mnemo-zoom' && Number.isFinite(event.data.value)) {
    zoom = Math.max(1, Math.min(3, event.data.value));
    fit();
    return;
  }
  if (
    event.data?.type !== 'mnemo-source' ||
    !(event.data.buffer instanceof ArrayBuffer) ||
    !Number.isInteger(event.data.slide)
  )
    return;
  const next = event.data;
  serial = serial
    .then(async () => {
      if (!viewer) {
        viewer = await PptxViewer.open(next.buffer, root, {
          width: 960,
          renderMode: 'slide',
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          externalMedia: 'block',
          pdfjs: false,
          lazySlides: true,
          lazyMedia: true,
        });
        if (!viewer.slideCount) throw new Error('No slides');
        height = (960 * viewer.slideHeight) / viewer.slideWidth;
        root.style.height = `${height}px`;
      }
      if (next.slide < 0 || next.slide >= viewer.slideCount)
        throw new Error('Slide unavailable');
      await viewer.goToSlide(next.slide);
      fit();
    })
    .catch(() => {
      root.textContent =
        'This deck could not be rendered. Attach a PDF export for a faithful preview.';
    });
});
function fit() {
  const scale = Math.min(innerWidth / 960, innerHeight / height) * zoom;
  root.style.transform = `scale(${scale})`;
  root.style.left = `${Math.max(0, (innerWidth - 960 * scale) / 2)}px`;
  root.style.top = `${Math.max(0, (innerHeight - height * scale) / 2)}px`;
}
addEventListener('resize', fit);
