import { useState, useRef } from 'react';
import { useLang } from '../context/LangContext';

const NO_IMG = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23f4f4f5'/%3E%3Ctext x='40' y='45' font-size='11' text-anchor='middle' fill='%23a1a1aa'%3ENo Image%3C/text%3E%3C/svg%3E";

/**
 * 閲覧モードのサイドパネル
 */
export function NodeViewerPanel({ node, treeData, canEdit, onEditMode, onToggleCollapse, lang }) {
  const { t } = useLang();
  if (!node) return null;

  const d = node.data;
  const groups = (d.groups || []).map(gId => treeData.polyphyletic_groups?.find(g => g.id === gId)).filter(Boolean);
  const hasChildren = d.children?.length > 0;

  const statusStyle = (() => {
    if (d.status === 'endangered') return { text: `EN — ${t('status_endangered')}`, color: 'text-red-700 border-red-300' };
    if (d.status === 'extinct') return { text: `† — ${t('status_extinct')}`, color: 'text-zinc-500 border-zinc-400 bg-zinc-100' };
    return { text: `LC — ${t('status_normal')}`, color: 'text-emerald-700 border-emerald-300' };
  })();

  return (
    <div className="font-mincho">
      {/* 画像ギャラリー（閲覧モード） */}
      {d.images?.length > 0 && (
        <div className="mb-5">
          <div className="grid grid-cols-4 gap-1 mb-1">
            <img
              src={d.images[0]}
              alt=""
              className="col-span-4 w-full aspect-square object-contain bg-zinc-50 border border-zinc-100"
              onError={e => { e.target.src = NO_IMG; }}
            />
            {d.images.slice(1).map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="w-full aspect-square object-cover bg-zinc-50 border border-zinc-100 cursor-pointer hover:brightness-75 transition"
                onError={e => { e.target.src = NO_IMG; }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 名称 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-grow min-w-0">
          <h2 className="text-2xl font-light tracking-wide text-zinc-800 leading-tight break-words">
            {d.name_ja || '---'}
          </h2>
          {d.name_sci && (
            <p className="text-zinc-400 text-sm italic mt-1" style={{ fontFamily: '"Times New Roman", serif' }}>
              {d.name_sci}
            </p>
          )}
        </div>
        {canEdit && (
          <button onClick={onEditMode} className="btn-ghost-sm ml-3 shrink-0">{t('btn_edit')}</button>
        )}
      </div>

      {/* ステータス + グループ */}
      <div className="flex flex-wrap gap-1.5 items-center mb-4 pb-4 border-b border-dashed border-zinc-200">
        <span className={`text-xs border px-2 py-0.5 font-bold font-sans ${statusStyle.color}`}>
          {statusStyle.text}
        </span>
        {groups.map(g => (
          <span key={g.id} className="flex items-center gap-1 text-xs border border-zinc-200 bg-white px-2 py-0.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: g.color }} />
            {g.name}
          </span>
        ))}
      </div>

      {/* 説明 */}
      {d.description && (
        <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-wrap mb-5">
          {d.description}
        </p>
      )}

      {/* 記載者 */}
      {(d.discoverer_name || d.discoverer_image) && (
        <div className="flex items-center gap-2 text-sm text-zinc-500 bg-zinc-50 border border-zinc-100 px-3 py-2 mb-4">
          {d.discoverer_image && (
            <img
              src={d.discoverer_image}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          <span className="font-bold text-xs text-zinc-400">{t('label_discoverer')}:</span>
          <span>{d.discoverer_name || '---'}</span>
        </div>
      )}

      {/* 折り畳みボタン */}
      {hasChildren && (
        <button
          onClick={onToggleCollapse}
          className="btn-ghost w-full text-xs border-dashed"
        >
          {d._collapsed ? t('btn_expand') : t('btn_collapse')}
        </button>
      )}
    </div>
  );
}


/**
 * 編集モードのサイドパネル
 */
export function NodeEditorPanel({
  node, treeData, onUpdate, onAddChild, onDeleteNode, onViewMode,
  onToggleCollapse, onCreateGroup, onAddToGroup, onRemoveFromGroup,
  onAddImageUrl, onDeleteImage, onUploadImage, zukanName,
}) {
  const { t } = useLang();
  if (!node) return null;

  const d = node.data;
  const nodeGroups = d.groups || [];
  const allGroups = treeData.polyphyletic_groups || [];
  const availableGroups = allGroups.filter(g => !nodeGroups.includes(g.id));

  const [localHex, setLocalHex] = useState('#6d28d9');

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `[${b}, ${g}, ${r}]`;
  }

  return (
    <div className="font-mincho text-sm">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-dashed border-zinc-200">
        <h3 className="text-sm font-light tracking-widest text-zinc-600">{t('edit_title')}</h3>
        <button onClick={onViewMode} className="btn-ghost-sm">{t('btn_view_mode')}</button>
      </div>

      {/* 和名 */}
      <div className="mb-3">
        <label className="label-text">{t('label_ja')}</label>
        <input id="edit-name-ja" type="text" defaultValue={d.name_ja || ''} className="input-field" />
      </div>
      {/* 学名 */}
      <div className="mb-3">
        <label className="label-text">{t('label_sci')}</label>
        <input id="edit-name-sci" type="text" defaultValue={d.name_sci || ''} className="input-field italic" style={{ fontFamily: '"Times New Roman", serif' }} />
      </div>
      {/* ステータス */}
      <div className="mb-3">
        <label className="label-text">{t('label_status')}</label>
        <select id="edit-status" defaultValue={d.status || 'normal'} className="input-field">
          <option value="normal">{t('status_normal')}</option>
          <option value="endangered">{t('status_endangered')}</option>
          <option value="extinct">{t('status_extinct')}</option>
        </select>
      </div>
      {/* 説明 */}
      <div className="mb-3">
        <label className="label-text">{t('label_desc')}</label>
        <textarea id="edit-desc" rows={3} defaultValue={d.description || ''} className="input-field resize-y" />
      </div>
      {/* 記載者 */}
      <div className="mb-4 border border-zinc-100 bg-zinc-50 p-3">
        <div className="text-xs font-bold text-zinc-500 mb-2 tracking-widest">{t('label_discoverer')}</div>
        <label className="label-text">{t('label_discoverer_name')}</label>
        <input id="edit-discoverer-name" type="text" defaultValue={d.discoverer_name || ''} className="input-field mb-2" />
        <label className="label-text">{t('label_discoverer_img')}</label>
        <input id="edit-discoverer-img" type="text" defaultValue={d.discoverer_image || ''} placeholder="http://..." className="input-field font-sans text-xs" />
      </div>

      {/* アクションボタン */}
      <div className="space-y-2 mb-5">
        <button onClick={() => onUpdate({
          name_ja: document.getElementById('edit-name-ja').value,
          name_sci: document.getElementById('edit-name-sci').value,
          status: document.getElementById('edit-status').value,
          description: document.getElementById('edit-desc').value,
          discoverer_name: document.getElementById('edit-discoverer-name').value,
          discoverer_image: document.getElementById('edit-discoverer-img').value,
        })} className="btn-ghost w-full">{t('btn_update')}</button>
        <button onClick={onAddChild} className="btn-ghost w-full">{t('btn_add')}</button>
        {node.depth > 0 && (
          <button onClick={onDeleteNode} className="btn-danger w-full">{t('btn_del_node')}</button>
        )}
        {d.children?.length > 0 && (
          <button onClick={onToggleCollapse} className="btn-ghost w-full text-xs border-dashed">
            {d._collapsed ? t('btn_expand') : t('btn_collapse')}
          </button>
        )}
      </div>

      {/* 多系統群 */}
      <div className="section-divider" />
      <div className="mb-4">
        <h4 className="text-xs font-bold tracking-widest text-zinc-500 mb-3">{t('poly_title')}</h4>
        {/* 所属グループ */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {nodeGroups.length === 0 ? (
            <span className="text-xs italic text-zinc-400">{t('msg_no_groups')}</span>
          ) : nodeGroups.map(gId => {
            const gInfo = allGroups.find(g => g.id === gId);
            if (!gInfo) return null;
            return (
              <span key={gId} className="flex items-center gap-1 text-xs border border-zinc-200 bg-white px-2 py-0.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: gInfo.color }} />
                {gInfo.name}
                <button onClick={() => onRemoveFromGroup(gId)} className="ml-1 text-zinc-300 hover:text-red-500 font-bold transition-colors">×</button>
              </span>
            );
          })}
        </div>
        {/* 既存グループへ追加 */}
        <div className="flex gap-1.5 mb-4">
          <select id="select-existing-group" className="input-field flex-grow text-xs py-1.5">
            {availableGroups.length === 0
              ? <option>---</option>
              : availableGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
            }
          </select>
          <button
            disabled={availableGroups.length === 0}
            onClick={() => {
              const val = document.getElementById('select-existing-group').value;
              if (val && val !== '---') onAddToGroup(val);
            }}
            className="btn-ghost-sm shrink-0 disabled:opacity-30"
          >{t('btn_register')}</button>
        </div>
        {/* 新規グループ定義 */}
        <div className="border border-zinc-100 bg-zinc-50 p-3">
          <div className="text-xs font-bold text-zinc-400 mb-2 tracking-wider">{t('new_group_title')}</div>
          <input id="new-group-name" type="text" placeholder={t('placeholder_group')} className="input-field mb-2 text-xs" />
          <div className="flex items-center gap-3 mb-2">
            <input
              type="color"
              id="new-group-color"
              value={localHex}
              onChange={e => setLocalHex(e.target.value)}
              className="w-8 h-8 border border-zinc-200 cursor-pointer bg-white p-0.5"
            />
            <span className="text-xs font-mono text-zinc-400">{hexToRgb(localHex)}</span>
          </div>
          <button
            onClick={() => {
              const name = document.getElementById('new-group-name').value.trim();
              const color = document.getElementById('new-group-color').value;
              if (name) onCreateGroup(name, color);
            }}
            className="btn-ghost w-full text-xs"
          >{t('btn_create_group')}</button>
        </div>
      </div>

      {/* 画像管理 */}
      <div className="section-divider" />
      <div className="mb-4">
        <h4 className="text-xs font-bold tracking-widest text-zinc-500 mb-3">{t('image_title')}</h4>
        {/* URL追加 */}
        <div className="flex gap-1.5 mb-3">
          <input id="input-image-url" type="text" placeholder="URL (http://...)" className="input-field flex-grow text-xs py-1.5 font-sans" />
          <button
            onClick={() => {
              const url = document.getElementById('input-image-url').value.trim();
              if (url) { onAddImageUrl(url); document.getElementById('input-image-url').value = ''; }
            }}
            className="btn-ghost-sm shrink-0"
          >{t('btn_register')}</button>
        </div>
        {/* ドロップゾーン */}
        <DropZone onUpload={onUploadImage} t={t} zukanName={zukanName} />
        {/* サムネイル一覧 */}
        {d.images?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {d.images.map((url, i) => (
              <div key={i} className="relative border border-zinc-100 p-0.5 bg-white">
                <img
                  src={url}
                  alt=""
                  className="w-20 h-20 object-cover block grayscale-[0.2] hover:grayscale-0 transition"
                  onError={e => { e.target.src = NO_IMG; }}
                />
                <button
                  onClick={() => onDeleteImage(i)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-zinc-300 rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-white flex items-center justify-center text-xs transition-all"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function DropZone({ onUpload, t }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(file) {
    if (file) onUpload(file);
  }

  return (
    <div
      onClick={() => fileRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
      className={`
        border border-dashed text-center text-zinc-400 text-xs py-5 cursor-pointer transition-all
        ${dragging ? 'border-zinc-600 bg-zinc-100' : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100'}
      `}
    >
      {t('drop_msg').split('\n').map((line, i) => <div key={i}>{line}</div>)}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

// useState/useRef をこのファイル内で使うためインポート
// (imports are defined at the top of this file)
