import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import TreeView from '../components/TreeView';
import { NodeViewerPanel, NodeEditorPanel } from '../components/NodePanel';
import LanguageSwitcher from '../components/LanguageSwitcher';
import Toast from '../components/Toast';

export default function EditorPage() {
  const { zukanName } = useParams();
  const { user } = useAuth();
  const { lang, t } = useLang();

  const [treeData, setTreeData] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [defaultFontSize, setDefaultFontSize] = useState(20);
  const [defaultInitialScale, setDefaultInitialScale] = useState(1.0);
  const [loading, setLoading] = useState(true);

  const [selectedNode, setSelectedNode] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [linkStyle, setLinkStyle] = useState('ortho');
  const [fontSize, setFontSize] = useState(20);
  const [highlightGroup, setHighlightGroup] = useState('');
  const [isNodeMoveMode, setIsNodeMoveMode] = useState(false);
  const [savedZoomTransform, setSavedZoomTransform] = useState(null);
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const treeDataRef = useRef(null);
  const stateKey = user ? `cladogram_view_${zukanName}_${user}` : null;

  // 初期データ読込
  useEffect(() => {
    fetch(`/api/editor/${encodeURIComponent(zukanName)}/data`)
      .then(r => r.json())
      .then(data => {
        setTreeData(data.tree_data);
        treeDataRef.current = data.tree_data;
        setCanEdit(data.can_edit);
        setDefaultFontSize(data.default_tree_font_size || 20);
        setDefaultInitialScale(data.default_initial_scale || 1.0);
        setFontSize(data.default_tree_font_size || 20);
        // 保存済み表示設定を復元
        if (user) {
          const raw = localStorage.getItem(`cladogram_view_${zukanName}_${user}`);
          if (raw) {
            try {
              const state = JSON.parse(raw);
              if (state.fontSize) setFontSize(state.fontSize);
              if (state.linkStyle) setLinkStyle(state.linkStyle);
              if (typeof state.moveMode === 'boolean') setIsNodeMoveMode(state.moveMode);
              if (state.transform) setSavedZoomTransform(state.transform);
            } catch { /* ignore */ }
          }
        }
      })
      .finally(() => setLoading(false));
  }, [zukanName, user]);

  const saveViewState = useCallback((updates = {}) => {
    if (!user || !stateKey) return;
    const current = (() => { try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); } catch { return {}; } })();
    localStorage.setItem(stateKey, JSON.stringify({ ...current, ...updates }));
  }, [user, stateKey]);

  const saveToServer = useCallback(async (tree, silent = false) => {
    if (!canEdit) return;
    try {
      const res = await fetch(`/api/editor/${encodeURIComponent(zukanName)}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tree),
      });
      const data = await res.json();
      if (data.status === 'success' && !silent) setToast(t('msg_save'));
    } catch {
      alert(t('msg_err_save'));
    }
  }, [canEdit, zukanName, t]);

  const handleTreeChange = useCallback((tree, silent = false) => {
    const next = { ...tree };
    setTreeData(next);
    treeDataRef.current = next;
    saveToServer(next, silent);
  }, [saveToServer]);

  const handleNodeSelect = useCallback((d3Node) => {
    setSelectedNode(d3Node);
    setIsEditMode(false);
    setSidebarOpen(true);
  }, []);

  const handleZoomChange = useCallback((transform) => {
    setSavedZoomTransform(transform);
    saveViewState({ transform });
  }, [saveViewState]);

  function changeLinkStyle(style) {
    setLinkStyle(style);
    setSavedZoomTransform(null); // スタイル変更時にリセット
    saveViewState({ linkStyle: style, transform: null });
  }

  function changeFontSize(delta) {
    const next = Math.min(30, Math.max(8, fontSize + delta));
    setFontSize(next);
    saveViewState({ fontSize: next });
  }

  function toggleNodeMoveMode() {
    const next = !isNodeMoveMode;
    setIsNodeMoveMode(next);
    saveViewState({ moveMode: next });
  }

  // ノード更新操作
  function updateNode(fields) {
    if (!selectedNode) return;
    Object.assign(selectedNode.data, fields);
    setIsEditMode(false);
    handleTreeChange(treeDataRef.current);
  }

  function addChildNode() {
    if (!selectedNode) return;
    const newNode = {
      id: `node_${Date.now()}`,
      name_ja: t('new_node_name'), name_sci: '',
      status: 'normal', description: '', discoverer_name: '', discoverer_image: '',
      images: [], groups: [], children: [],
    };
    if (!selectedNode.data.children) selectedNode.data.children = [];
    selectedNode.data.children.push(newNode);
    selectedNode.data._collapsed = false;
    handleTreeChange(treeDataRef.current);
  }

  function deleteNode() {
    if (!selectedNode || selectedNode.depth === 0) { alert(t('msg_root_del')); return; }
    if (!confirm(t('confirm_del_node').replace('{0}', selectedNode.data.name_ja))) return;
    const parentData = selectedNode.parent.data;
    const idx = parentData.children?.findIndex(c => c.id === selectedNode.data.id);
    if (idx > -1) parentData.children.splice(idx, 1);
    setSelectedNode(null);
    setSidebarOpen(false);
    handleTreeChange(treeDataRef.current);
  }

  function toggleCollapse() {
    if (!selectedNode) return;
    selectedNode.data._collapsed = !selectedNode.data._collapsed;
    handleTreeChange(treeDataRef.current, true);
    setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data } } : null);
  }

  // グループ操作
  function addGroupPropagate(nodeData, gId) {
    function addDown(n) {
      if (!n.groups) n.groups = [];
      if (!n.groups.includes(gId)) n.groups.push(gId);
      if (n.children) n.children.forEach(addDown);
    }
    addDown(nodeData);
    // 親への伝播はツリー全体を d3.hierarchy で解析（ここでは省略しシンプルに）
  }

  function removeGroupPropagate(nodeData, gId) {
    function removeDown(n) {
      if (n.groups) n.groups = n.groups.filter(id => id !== gId);
      if (n.children) n.children.forEach(removeDown);
    }
    removeDown(nodeData);
    // 親から削除
    let curr = selectedNode?.parent;
    while (curr) {
      if (curr.data.groups?.includes(gId)) {
        curr.data.groups = curr.data.groups.filter(id => id !== gId);
        curr = curr.parent;
      } else break;
    }
  }

  function createGroup(name, color) {
    if (!treeDataRef.current.polyphyletic_groups) treeDataRef.current.polyphyletic_groups = [];
    const newGroup = { id: `group_${Date.now()}`, name, color };
    treeDataRef.current.polyphyletic_groups.push(newGroup);
    if (selectedNode) addGroupPropagate(selectedNode.data, newGroup.id);
    handleTreeChange(treeDataRef.current);
  }

  function addToGroup(gId) {
    if (!selectedNode) return;
    addGroupPropagate(selectedNode.data, gId);
    handleTreeChange(treeDataRef.current);
  }

  function removeFromGroup(gId) {
    if (!selectedNode) return;
    removeGroupPropagate(selectedNode.data, gId);
    handleTreeChange(treeDataRef.current);
  }

  function addImageUrl(url) {
    if (!selectedNode) return;
    if (!selectedNode.data.images) selectedNode.data.images = [];
    selectedNode.data.images.push(url);
    handleTreeChange(treeDataRef.current);
    setToast(t('msg_img_added'));
  }

  function deleteImage(idx) {
    if (!selectedNode || !confirm(t('confirm_del_img'))) return;
    selectedNode.data.images.splice(idx, 1);
    handleTreeChange(treeDataRef.current);
  }

  async function uploadImage(file) {
    if (!selectedNode) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/editor/${encodeURIComponent(zukanName)}/upload_image`, {
        method: 'POST', body: formData,
      });
      const result = await res.json();
      if (result.status === 'success') {
        if (!selectedNode.data.images) selectedNode.data.images = [];
        selectedNode.data.images.push(result.image_url);
        handleTreeChange(treeDataRef.current);
        setToast(t('msg_img_added'));
      }
    } catch {
      alert(t('msg_err_save'));
    }
  }

  const allGroups = treeData?.polyphyletic_groups || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper font-mincho text-zinc-400 text-sm tracking-widest">
        &hellip;
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-paper overflow-hidden">

      {/* トップヘッダー */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-zinc-200 shadow-sm z-10 shrink-0 gap-4">
        {/* 左：戻るリンク + タイトル */}
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors whitespace-nowrap border-b border-transparent hover:border-zinc-400">
            {t('back_link')}
          </Link>
          <h1 className="font-mincho text-base font-light tracking-widest text-zinc-800 truncate">{zukanName}</h1>
          <span className={`shrink-0 text-xs border px-2 py-0.5 ${canEdit ? 'border-violet-400 text-violet-600' : 'border-zinc-300 text-zinc-400'}`}>
            {canEdit ? t('mode_edit') : t('mode_view')}
          </span>
        </div>

        {/* 中央：描画設定 */}
        <div className="flex items-center gap-3 text-xs font-mincho text-zinc-500 shrink-0">
          <span className="hidden sm:inline">{t('display_settings')}</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="linkStyle" value="ortho" checked={linkStyle === 'ortho'} onChange={() => changeLinkStyle('ortho')} className="accent-violet-600" />
            <span>{t('style_ortho')}</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="radio" name="linkStyle" value="radial" checked={linkStyle === 'radial'} onChange={() => changeLinkStyle('radial')} className="accent-violet-600" />
            <span>{t('style_radial')}</span>
          </label>

          {canEdit && (
            <>
              <span className="border-l border-zinc-200 h-4 mx-1" />
              <span className="hidden sm:inline">{t('label_move_mode')}</span>
              <button
                onClick={toggleNodeMoveMode}
                className={`border px-2 py-0.5 text-xs transition-colors ${isNodeMoveMode ? 'border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-100'}`}
              >
                {isNodeMoveMode ? t('move_mode_on') : t('move_mode_off')}
              </button>
            </>
          )}

          <span className="border-l border-zinc-200 h-4 mx-1" />

          <span className="hidden sm:inline">{t('label_highlight')}</span>
          <select
            value={highlightGroup}
            onChange={e => setHighlightGroup(e.target.value)}
            className="border border-zinc-200 bg-white text-xs px-1.5 py-0.5 font-mincho focus:outline-none focus:border-zinc-400"
          >
            <option value="">{t('val_none')}</option>
            {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          <span className="border-l border-zinc-200 h-4 mx-1" />

          <span className="hidden sm:inline">{t('label_fontsize')}</span>
          <button onClick={() => changeFontSize(-1)} className="border border-zinc-200 px-1.5 py-0.5 text-xs hover:bg-zinc-100 transition-colors">A−</button>
          <span className="text-zinc-400 text-xs w-9 text-center">{fontSize}px</span>
          <button onClick={() => changeFontSize(1)} className="border border-zinc-200 px-1.5 py-0.5 text-xs hover:bg-zinc-100 transition-colors">A＋</button>

          {/* ヘルプ */}
          <div className="relative group">
            <button className="w-5 h-5 rounded-full border border-zinc-300 text-zinc-400 text-xs flex items-center justify-center hover:border-zinc-500 transition-colors">?</button>
            <div className="absolute top-full right-0 mt-1.5 w-80 bg-white border border-zinc-200 shadow-md text-xs text-zinc-400 p-3 leading-relaxed whitespace-normal hidden group-hover:block z-20">
              {t('scroll_help')}
            </div>
          </div>
        </div>

        {/* 右：言語切替 */}
        <LanguageSwitcher className="shrink-0" />
      </header>

      {/* メインエリア */}
      <div className="flex flex-grow overflow-hidden relative">

        {/* ツリーエリア */}
        <div className="flex-grow relative bg-white overflow-hidden">
          {treeData && (
            <TreeView
              treeData={treeData}
              canEdit={canEdit}
              linkStyle={linkStyle}
              fontSize={fontSize}
              highlightGroup={highlightGroup}
              defaultInitialScale={defaultInitialScale}
              onNodeSelect={handleNodeSelect}
              onTreeChange={handleTreeChange}
              savedZoomTransform={savedZoomTransform}
              onZoomChange={handleZoomChange}
              selectedNodeId={selectedNode?.data?.id}
              lang={lang}
              nodeMoveMode={isNodeMoveMode}
            />
          )}
          {!sidebarOpen && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-zinc-300 font-mincho tracking-widest pointer-events-none">
              {t('default_msg')}
            </div>
          )}
        </div>

        {/* サイドバー */}
        <aside className={`
          shrink-0 bg-white border-l border-zinc-200 overflow-y-auto
          transition-all duration-300 shadow-[-4px_0_12px_rgba(0,0,0,0.03)]
          ${sidebarOpen ? 'w-80' : 'w-0'}
        `}>
          {sidebarOpen && selectedNode && (
            <div className="p-5">
              {canEdit && isEditMode ? (
                <NodeEditorPanel
                  node={selectedNode}
                  treeData={treeData}
                  onUpdate={updateNode}
                  onAddChild={addChildNode}
                  onDeleteNode={deleteNode}
                  onViewMode={() => setIsEditMode(false)}
                  onToggleCollapse={toggleCollapse}
                  onCreateGroup={createGroup}
                  onAddToGroup={addToGroup}
                  onRemoveFromGroup={removeFromGroup}
                  onAddImageUrl={addImageUrl}
                  onDeleteImage={deleteImage}
                  onUploadImage={uploadImage}
                  zukanName={zukanName}
                />
              ) : (
                <NodeViewerPanel
                  node={selectedNode}
                  treeData={treeData}
                  canEdit={canEdit}
                  onEditMode={() => setIsEditMode(true)}
                  onToggleCollapse={toggleCollapse}
                  lang={lang}
                />
              )}

              {/* 閉じるボタン */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="mt-6 w-full text-xs text-zinc-300 hover:text-zinc-500 border border-dashed border-zinc-100 py-2 transition-colors"
              >✕</button>
            </div>
          )}
        </aside>
      </div>

      {/* トースト */}
      <Toast message={toast} onHide={() => setToast('')} />
    </div>
  );
}
