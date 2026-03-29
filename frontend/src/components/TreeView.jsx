import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';

/**
 * D3.jsを使ったクラドグラム描画コンポーネント
 * Props:
 *   treeData, canEdit, linkStyle, fontSize, highlightGroup,
 *   defaultInitialScale, onNodeSelect, onTreeChange,
 *   savedZoomTransform, onZoomChange, selectedNodeId, lang, nodeMoveMode
 */
export default function TreeView({
  treeData,
  canEdit,
  linkStyle,
  fontSize,
  highlightGroup,
  defaultInitialScale,
  onNodeSelect,
  onTreeChange,
  savedZoomTransform,
  onZoomChange,
  selectedNodeId,
  lang,
  nodeMoveMode,
}) {
  const containerRef = useRef(null);
  const zoomTransformRef = useRef(savedZoomTransform);
  const ignoreNextClickRef = useRef(false);

  useEffect(() => {
    zoomTransformRef.current = savedZoomTransform;
  }, [savedZoomTransform]);

  useEffect(() => {
    if (!containerRef.current || !treeData || Object.keys(treeData).length === 0) return;
    renderTree();
  }, [treeData, linkStyle, fontSize, highlightGroup, selectedNodeId, nodeMoveMode]);

  function collectSubtreeIds(node, ids = new Set()) {
    if (!node) return ids;
    ids.add(node.id);
    (node.children || []).forEach(child => collectSubtreeIds(child, ids));
    return ids;
  }

  function findNodeById(nodeId, node = treeData, parent = null) {
    if (!node) return null;
    if (node.id === nodeId) return { node, parent };
    for (const child of node.children || []) {
      const found = findNodeById(nodeId, child, node);
      if (found) return found;
    }
    return null;
  }

  function moveNodeToParent(nodeId, newParentId) {
    const sourceInfo = findNodeById(nodeId);
    const targetInfo = findNodeById(newParentId);
    if (!sourceInfo || !targetInfo || !sourceInfo.parent) return { ok: false, reason: 'invalid' };
    if (collectSubtreeIds(sourceInfo.node).has(newParentId)) return { ok: false, reason: 'descendant' };
    const siblings = sourceInfo.parent.children || [];
    const idx = siblings.findIndex(c => c.id === nodeId);
    if (idx === -1) return { ok: false, reason: 'invalid' };
    siblings.splice(idx, 1);
    if (!targetInfo.node.children) targetInfo.node.children = [];
    targetInfo.node.children.push(sourceInfo.node);
    targetInfo.node._collapsed = false;
    return { ok: true };
  }

  function renderTree() {
    const el = containerRef.current;
    if (!el) return;
    const container = d3.select(el);
    container.selectAll('*').remove();

    const width = el.getBoundingClientRect().width;
    const height = el.getBoundingClientRect().height;
    const margin = { top: 80, right: 220, bottom: 80, left: 220 };

    const svgRoot = container.append('svg').attr('width', width).attr('height', height);
    const g = svgRoot.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.05, 5])
      .on('zoom', event => g.attr('transform', event.transform))
      .on('end', event => {
        const t = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        zoomTransformRef.current = t;
        onZoomChange(t);
      });

    svgRoot.call(zoom);
    svgRoot.on('wheel.zoom', null);
    svgRoot.on('wheel', event => {
      event.preventDefault();
      const cur = d3.zoomTransform(svgRoot.node());
      if (event.ctrlKey || event.metaKey) zoom.scaleBy(svgRoot, Math.pow(2, -event.deltaY * 0.004));
      else if (event.shiftKey) zoom.translateBy(svgRoot, -event.deltaY / cur.k, 0);
      else zoom.translateBy(svgRoot, -event.deltaX / cur.k, -event.deltaY / cur.k);
    });

    const isRadial = linkStyle === 'radial';
    const root = d3.hierarchy(treeData, d => d._collapsed ? null : d.children);

    if (isRadial) {
      const maxDepth = d3.max(root.descendants(), d => d.depth) || 1;
      const radius = Math.max(400, maxDepth * 240);
      d3.tree().size([Math.PI, radius])(root);
      if (zoomTransformRef.current) {
        const zt = zoomTransformRef.current;
        svgRoot.call(zoom.transform, d3.zoomIdentity.translate(zt.x, zt.y).scale(zt.k));
      } else {
        svgRoot.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height - margin.bottom).scale(defaultInitialScale));
      }
    } else {
      d3.tree().nodeSize([65, 280])(root);
      if (zoomTransformRef.current) {
        const zt = zoomTransformRef.current;
        svgRoot.call(zoom.transform, d3.zoomIdentity.translate(zt.x, zt.y).scale(zt.k));
      } else {
        svgRoot.call(zoom.transform, d3.zoomIdentity.translate(margin.left, height / 2).scale(defaultInitialScale));
      }
    }

    root.each(d => {
      if (isRadial) {
        const angle = d.x - Math.PI / 2;
        d.cx = d.y * Math.sin(angle);
        d.cy = -d.y * Math.cos(angle);
        d.angle = angle;
      } else {
        d.cx = d.y;
        d.cy = d.x;
      }
    });

    const isHighlighted = d =>
      !highlightGroup || (d.data.groups && d.data.groups.includes(highlightGroup));

    // リンク描画
    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .style('opacity', d => {
        if (!highlightGroup) return 1;
        return isHighlighted(d.source) && isHighlighted(d.target) ? 1 : 0.12;
      })
      .attr('d', d => {
        if (isRadial) {
          const r1 = d.source.y, r2 = d.target.y;
          const a1 = d.source.angle, a2 = d.target.angle;
          if (r1 === 0) return `M${d.source.cx},${d.source.cy} L${d.target.cx},${d.target.cy}`;
          const p1x = r1 * Math.sin(a2), p1y = -r1 * Math.cos(a2);
          const sweep = a2 > a1 ? 1 : 0;
          return `M${d.source.cx},${d.source.cy} A${r1},${r1} 0 0,${sweep} ${p1x},${p1y} L${d.target.cx},${d.target.cy}`;
        }
        return `M${d.source.cx},${d.source.cy} V${d.target.cy} H${d.target.cx}`;
      });

    // ノード描画
    const node = g.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', d => {
        let cls = 'node' + (d.data.children?.length ? ' node--internal' : ' node--leaf');
        if (canEdit && nodeMoveMode && d.depth > 0) cls += ' node--movable';
        return cls;
      })
      .attr('transform', d => `translate(${d.cx},${d.cy})`)
      .style('opacity', d => (!highlightGroup || isHighlighted(d)) ? 1 : 0.12)
      .on('click', (event, d) => {
        if (ignoreNextClickRef.current) { ignoreNextClickRef.current = false; return; }
        selectNode(d, event.currentTarget);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        event.preventDefault();
        if (d.data.children?.length) {
          const targetId = d.data.id;
          d.data._collapsed = !d.data._collapsed;
          if (canEdit) onTreeChange(treeData, true);
          renderTree();
          const svgNode = g.selectAll('.node').filter(nd => nd.data.id === targetId).node();
          if (svgNode) svgNode.dispatchEvent(new MouseEvent('click'));
        }
      });

    function selectNode(d, targetNodeEl) {
      onNodeSelect(d);
      g.selectAll('.node > circle')
        .style('stroke', '#3f3f46')
        .style('stroke-width', '1.2px')
        .style('fill', nd => nd.data._collapsed ? '#3f3f46' : (nd.data.children?.length ? '#3f3f46' : '#fff'));
      d3.select(targetNodeEl).select('circle')
        .style('stroke', '#6d28d9')
        .style('stroke-width', '3px')
        .style('fill', nd => nd.data._collapsed ? '#3f3f46' : '#fff');
    }

    // ドラッグ（編集時かつノード移動モード時のみ）
    if (canEdit && nodeMoveMode) {
      const dropThreshold = 72;
      const dragState = {
        draggedId: null, startLocal: [0, 0], origin: [0, 0],
        moved: false, descendantIds: new Set(), dropTargetId: null,
      };

      function getLocalPointer(sourceEvent) {
        const pointer = d3.pointer(sourceEvent, svgRoot.node());
        return d3.zoomTransform(svgRoot.node()).invert(pointer);
      }

      function findDropTarget(px, py) {
        let best = null, bestDist = Infinity;
        root.descendants().forEach(c => {
          if (dragState.descendantIds.has(c.data.id)) return;
          const dist = Math.hypot(c.cx - px, c.cy - py);
          if (dist < dropThreshold && dist < bestDist) { best = c; bestDist = dist; }
        });
        return best;
      }

      function paintDropTarget(nodeId) {
        node.classed('node--drop-target', d => d.data.id === nodeId);
      }

      const dragBehavior = d3.drag()
        .on('start', function (event, d) {
          event.sourceEvent.stopPropagation();
          dragState.draggedId = d.data.id;
          dragState.descendantIds = collectSubtreeIds(d.data);
          dragState.startLocal = getLocalPointer(event.sourceEvent);
          dragState.origin = [d.cx, d.cy];
          dragState.moved = false;
          dragState.dropTargetId = null;
          d3.select(this).classed('node--dragging', true).raise();
        })
        .on('drag', function (event) {
          if (!dragState.draggedId) return;
          const [px, py] = getLocalPointer(event.sourceEvent);
          const dx = px - dragState.startLocal[0], dy = py - dragState.startLocal[1];
          if (Math.hypot(dx, dy) > 4) dragState.moved = true;
          d3.select(this).attr('transform', `translate(${dragState.origin[0] + dx},${dragState.origin[1] + dy})`);
          const dropTarget = findDropTarget(px, py);
          dragState.dropTargetId = dropTarget?.data.id || null;
          paintDropTarget(dragState.dropTargetId);
        })
        .on('end', function (event, d) {
          d3.select(this).classed('node--dragging', false);
          paintDropTarget(null);
          const { moved, dropTargetId } = dragState;
          dragState.draggedId = null;
          dragState.dropTargetId = null;

          if (!moved || !dropTargetId) {
            if (moved) ignoreNextClickRef.current = true;
            renderTree();
            return;
          }
          const result = moveNodeToParent(d.data.id, dropTargetId);
          ignoreNextClickRef.current = true;
          if (!result.ok) {
            if (result.reason === 'descendant') alert(lang === 'ja' ? '当該クレードを、その子孫の下へ移すことはできません。' : 'You cannot move a clade under one of its descendants.');
            renderTree();
            return;
          }
          onTreeChange(treeData);
          renderTree();
          const svgNode = g.selectAll('.node').filter(nd => nd.data.id === d.data.id).node();
          if (svgNode) svgNode.dispatchEvent(new MouseEvent('click'));
        });

      node.filter(d => d.depth > 0).call(dragBehavior);
    }

    // ハイライトオーバーレイ
    node.each(function (d) {
      if (highlightGroup && isHighlighted(d)) {
        const gInfo = treeData.polyphyletic_groups?.find(g => g.id === highlightGroup);
        if (gInfo) {
          d3.select(this).insert('circle', ':first-child')
            .attr('r', 40)
            .style('fill', gInfo.color)
            .style('opacity', 0.2)
            .style('pointer-events', 'none');
        }
      }
    });

    // ノード円
    node.append('circle')
      .attr('r', d => d.data._collapsed ? 6 : 5)
      .style('stroke', d => d.data.id === selectedNodeId ? '#6d28d9' : '#3f3f46')
      .style('stroke-width', d => d.data.id === selectedNodeId ? '3px' : '1.2px')
      .style('fill', d => {
        if (d.data.id === selectedNodeId) return d.data._collapsed ? '#3f3f46' : '#fff';
        return d.data._collapsed ? '#3f3f46' : (d.data.children?.length ? '#3f3f46' : '#fff');
      });

    node.filter(d => d.data._collapsed).append('path')
      .attr('d', 'M-3,0 H3 M0,-3 V3')
      .style('stroke', '#fff')
      .style('stroke-width', '1.5px')
      .style('pointer-events', 'none');

    // 画像オーバーレイ
    const imgSize = 56;
    const imgOffset = imgSize / 2;
    const getIsLeft = d => isRadial ? (d.angle * 180 / Math.PI) < 0 : !!(d.data.children?.length);
    const getXOffset = d => {
      const hasImg = d.data.images?.length > 0;
      const offset = 10 + (hasImg ? imgSize + 8 : 0);
      return getIsLeft(d) ? -offset : offset;
    };

    node.each(function (d) {
      if (d.data.images?.length > 0) {
        const isLeft = getIsLeft(d);
        d3.select(this).append('image')
          .attr('href', d.data.images[0])
          .attr('width', imgSize).attr('height', imgSize)
          .attr('y', -imgOffset)
          .attr('x', isLeft ? -10 - imgSize : 10)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .style('clip-path', 'circle(50%)')
          .style('opacity', d.data.status === 'extinct' ? '0.45' : '0.95')
          .style('pointer-events', 'all')
          .on('click', function (event, nd) {
            event.stopPropagation();
            const parentNode = this.parentNode;
            if (parentNode) selectNode(nd, parentNode);
          })
          .on('error', function () { d3.select(this).remove(); });
      }
    });

    // テキスト
    const fontSizePx = `${fontSize}px`;
    const fontSizeSciPx = `${Math.max(8, fontSize - 1)}px`;

    const textGroup = node.append('text')
      .attr('dy', '.35em')
      .attr('transform', d => {
        if (isRadial) {
          const angleDeg = d.angle * 180 / Math.PI;
          return angleDeg < 0 ? `rotate(${angleDeg + 90})` : `rotate(${angleDeg - 90})`;
        }
        return null;
      })
      .attr('x', getXOffset)
      .style('text-anchor', d => getIsLeft(d) ? 'end' : 'start')
      .style('font-size', fontSizePx)
      .style('pointer-events', 'all')
      .on('click', function (event, nd) {
        event.stopPropagation();
        const parentNode = this.parentNode;
        if (parentNode) selectNode(nd, parentNode);
      });

    const titleLine = textGroup.append('tspan')
      .style('fill', d => d.data.status === 'extinct' ? '#a1a1aa' : null);

    titleLine.append('tspan')
      .text(d => (d.data.status === 'extinct' ? '† ' : '') + (d.data.name_ja || ''));

    titleLine.append('tspan')
      .filter(d => d.data.status === 'endangered')
      .style('fill', '#dc2626')
      .style('font-size', '10px')
      .style('font-family', 'sans-serif')
      .style('font-weight', 'bold')
      .attr('dx', '4px')
      .text('EN');

    textGroup.append('tspan')
      .attr('class', 'sci-name')
      .style('fill', d => d.data.status === 'extinct' ? '#d4d4d8' : '#71717a')
      .style('font-size', fontSizeSciPx)
      .attr('x', getXOffset)
      .attr('dy', '1.4em')
      .text(d => d.data.name_sci || '');

    // 多系統群タグ
    node.each(function (d) {
      if (d.data.groups?.length > 0) {
        const groupG = d3.select(this).append('g').attr('class', 'poly-tags');
        groupG.attr('transform', () => {
          if (isRadial) {
            const angleDeg = d.angle * 180 / Math.PI;
            return angleDeg < 0 ? `rotate(${angleDeg + 90})` : `rotate(${angleDeg - 90})`;
          }
          return null;
        });
        const isLeft = getIsLeft(d);
        const startX = getXOffset(d);
        d.data.groups.forEach((gId, i) => {
          const gInfo = (treeData.polyphyletic_groups || []).find(g => g.id === gId);
          if (gInfo) {
            const tagD = 24, tagS = 28;
            const tagX = isLeft ? startX - (i * tagS) - tagD : startX + (i * tagS);
            groupG.append('circle')
              .attr('cx', tagX + tagD / 2).attr('cy', 44).attr('r', tagD / 2)
              .style('fill', gInfo.color)
              .append('title').text(gInfo.name);
          }
        });
      }
    });
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
