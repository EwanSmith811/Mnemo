import sanitizeHtml from 'sanitize-html';
/** Model output is untrusted: retain educational formatting, discard active content. */
export function safeStudyHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      'b',
      'i',
      'u',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'sup',
      'sub',
      'code',
      'pre',
      'blockquote',
      'span',
    ],
    allowedAttributes: {},
  });
}
