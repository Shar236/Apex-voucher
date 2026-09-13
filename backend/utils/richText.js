import sanitizeHtml from 'sanitize-html';

/**
 * Shared allow-list HTML sanitiser for admin-authored rich content that is
 * rendered on the public site (currently: a product's "About This Product"
 * section — see backend/models/Product.js `productContent.content`).
 *
 * The client WYSIWYG (web/components/admin/blog-rich-editor.tsx) produces plain
 * semantic HTML; this replaces whatever the client sent on every save so a
 * hand-crafted payload can never inject script / event handlers / unknown
 * schemes. Modelled on blogController.sanitizeBlogContent but standalone and
 * without the blog-specific table normalisation.
 */
export const sanitizeRichHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: [
      'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's',
      'sub', 'sup', 'mark', 'small', 'del', 'ins', 'abbr', 'code', 'pre', 'kbd',
      'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption',
      'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'span', 'div',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan', 'scope'],
      th: ['colspan', 'rowspan', 'scope'],
      '*': ['class'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { a: ['https', 'http', 'mailto', 'tel'] },
    disallowedTagsMode: 'discard',
    transformTags: {
      // Force a safe `rel` on outbound links WITHOUT discarding the rest of the
      // tag. Passing mergeable=false makes simpleTransform REPLACE every
      // attribute — silently dropping `href`/`target` and leaving dead,
      // unclickable <a> tags. mergeable=true keeps href/target/title and just
      // stamps the safe rel.
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
};

export default { sanitizeRichHtml };
