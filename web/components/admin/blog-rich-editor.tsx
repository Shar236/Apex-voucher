'use client';

import '@/app/blog/blog.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Heading2, Heading3, List, ListOrdered, Quote, Link2,
  Image as ImageIcon, Table as TableIcon, Code2, Undo2, Redo2, Eraser, Loader2, Type,
} from 'lucide-react';
import { adminBlogApi } from '@/lib/admin-blog-api';

function ToolBtn({ onClick, title, disabled, children }: { onClick: () => void; title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-neutral-600 dark:text-neutral-300 hover:bg-brand-pink/10 hover:text-brand-pink disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  );
}

/**
 * Practical WYSIWYG editor for a non-developer admin. Produces plain semantic
 * HTML (h2/h3, p, strong, em, ul/ol, blockquote, a, img, table) which the
 * Express backend re-sanitises against its allow-list on save. A raw HTML
 * "Source" mode is available for power users / pasting existing markup.
 *
 * Images upload straight to Cloudinary via /api/admin/blogs/upload-image and are
 * inserted as <img src="<cloudinary url>">. Nothing is written to /public.
 */
export function BlogRichEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<'rich' | 'source'>('rich');
  const [uploading, setUploading] = useState(false);
  // `lastHtml` mirrors the last state we KNOW is in the contentEditable DOM.
  // It deliberately starts as `null` (nothing written yet) rather than the
  // initial `value`: callers such as the product editor mount us WITH the
  // content already populated, and a change-only sync would skip exactly that
  // value → the editor would render blank even though the data is present.
  const lastHtml = useRef<string | null>(null);
  // The <div> node we most recently hydrated. The rich surface is unmounted
  // and recreated every time the user toggles Source mode, so returning to
  // Rich mode must rehydrate the fresh node even when `value` did not change.
  const mountedSurface = useRef<HTMLDivElement | null>(null);

  // Hydrate the contentEditable DOM from `value` whenever:
  //   (a) the rich surface first mounts (initial content arrives WITH us),
  //   (b) it is remounted after a Source-mode round-trip, or
  //   (c) `value` changed elsewhere (revision restore / external draft reset).
  // It never writes over the editor's own keystrokes — those flow back through
  // `emit` (onInput/onBlur), which keeps `lastHtml` in sync with the DOM.
  useEffect(() => {
    if (mode !== 'rich' || !ref.current) return;
    if (ref.current === mountedSurface.current && value === lastHtml.current) return;
    mountedSurface.current = ref.current;
    ref.current.innerHTML = value || '';
    lastHtml.current = value;
  }, [value, mode]);

  const emit = useCallback(() => {
    const html = ref.current?.innerHTML ?? '';
    lastHtml.current = html;
    onChange(html);
  }, [onChange]);

  const exec = (command: string, arg?: string) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const format = (tag: string) => exec('formatBlock', tag);

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    exec('createLink', url);
    // force target/rel on the just-created anchor
    const sel = window.getSelection();
    const a = sel && sel.anchorNode ? (sel.anchorNode.parentElement?.closest('a') as HTMLAnchorElement | null) : null;
    if (a && /^https?:\/\//i.test(url) && !url.includes(window.location.host)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      emit();
    }
  };

  const insertTable = () => {
    const cols = Math.max(1, Math.min(8, parseInt(window.prompt('Columns?', '3') || '3', 10) || 3));
    const rows = Math.max(1, Math.min(20, parseInt(window.prompt('Body rows?', '2') || '2', 10) || 2));
    const head = `<thead><tr>${Array.from({ length: cols }, (_, i) => `<th>Heading ${i + 1}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${Array.from({ length: rows }, () => `<tr>${Array.from({ length: cols }, () => '<td>Cell</td>').join('')}</tr>`).join('')}</tbody>`;
    exec('insertHTML', `<table>${head}${body}</table><p><br/></p>`);
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const res = await adminBlogApi.uploadImage(file);
    setUploading(false);
    if (!res.success || !res.url) {
      window.alert(res.message || 'Image upload failed');
      return;
    }
    const alt = window.prompt('Alt text for this image (for SEO & accessibility):', file.name.replace(/\.[a-z]+$/i, '')) || '';
    exec('insertHTML', `<figure><img src="${res.url}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy" />${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure><p><br/></p>`);
  };

  return (
    <div className="rounded-2xl border border-[#EAEAEA] dark:border-[#292929] overflow-hidden bg-white dark:bg-[#0E0E0E]">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-[#EAEAEA] dark:border-[#292929] bg-neutral-50 dark:bg-[#161616]">
        {mode === 'rich' ? (
          <>
            <ToolBtn disabled={disabled} onClick={() => format('<p>')} title="Paragraph"><Type className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => format('<h2>')} title="Heading 2"><Heading2 className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => format('<h3>')} title="Heading 3"><Heading3 className="w-4 h-4" /></ToolBtn>
            <span className="w-px h-5 bg-[#EAEAEA] dark:bg-[#292929] mx-1" />
            <ToolBtn disabled={disabled} onClick={() => exec('bold')} title="Bold"><Bold className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => exec('italic')} title="Italic"><Italic className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => exec('underline')} title="Underline"><Underline className="w-4 h-4" /></ToolBtn>
            <span className="w-px h-5 bg-[#EAEAEA] dark:bg-[#292929] mx-1" />
            <ToolBtn disabled={disabled} onClick={() => exec('insertUnorderedList')} title="Bullet list"><List className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => format('<blockquote>')} title="Quote"><Quote className="w-4 h-4" /></ToolBtn>
            <span className="w-px h-5 bg-[#EAEAEA] dark:bg-[#292929] mx-1" />
            <ToolBtn disabled={disabled} onClick={addLink} title="Insert link"><Link2 className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => fileRef.current?.click()} title="Insert image (Cloudinary)">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            </ToolBtn>
            <ToolBtn disabled={disabled} onClick={insertTable} title="Insert table"><TableIcon className="w-4 h-4" /></ToolBtn>
            <span className="w-px h-5 bg-[#EAEAEA] dark:bg-[#292929] mx-1" />
            <ToolBtn disabled={disabled} onClick={() => exec('removeFormat')} title="Clear formatting"><Eraser className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => exec('undo')} title="Undo"><Undo2 className="w-4 h-4" /></ToolBtn>
            <ToolBtn disabled={disabled} onClick={() => exec('redo')} title="Redo"><Redo2 className="w-4 h-4" /></ToolBtn>
          </>
        ) : (
          <span className="px-2 text-[11px] font-black uppercase tracking-wider text-neutral-500">HTML source — the backend re-sanitises on save</span>
        )}
        <button
          type="button"
          onClick={() => {
            if (mode === 'rich') emit();
            setMode((m) => (m === 'rich' ? 'source' : 'rich'));
          }}
          className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black ${mode === 'source' ? 'bg-brand-pink text-white' : 'text-neutral-600 dark:text-neutral-300 hover:bg-brand-pink/10'}`}
        >
          <Code2 className="w-3.5 h-3.5" /> {mode === 'source' ? 'Rich text' : 'Source'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
      </div>

      {mode === 'rich' ? (
        <div
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          data-placeholder="Write the article…  Use the toolbar for headings, lists, links, images and tables."
          className="blog-editor-surface prose-blog max-w-none min-h-[22rem] max-h-[42rem] overflow-y-auto px-5 py-4 text-sm leading-relaxed focus:outline-none"
        />
      ) : (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => {
            lastHtml.current = e.target.value;
            onChange(e.target.value);
          }}
          spellCheck={false}
          className="w-full min-h-[22rem] max-h-[42rem] px-5 py-4 font-mono text-xs leading-relaxed bg-white dark:bg-[#0E0E0E] focus:outline-none resize-y"
        />
      )}
    </div>
  );
}
