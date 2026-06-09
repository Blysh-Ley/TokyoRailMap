
`Refactor: panel final closure via one-turn sub-issues`

完成定义建议写成这四条：
1. `panel.js` 不再同时拥有 catalog、theme helper、export helper、station bootstrap、hover/pin 状态机、trip-detail renderer、preview payload builder 等大块职责。
2. `node tests/uiArchitectureBudgets.smoke.mjs` 通过，且不靠放宽 budget 过关。
3. `node tests/panelFinalDecouplingGate.smoke.mjs` 持续通过。
4. panel 主路径保持兼容：站点打开、线路切换、方向筛选、trip detail hover/pin、route preview、print request、scroll restore。

**建议的 sub-issues**

1. `Refactor: extract panel theme/color helper pack`  
只抽 `panelIsDarkThemeActive`、颜色解析、暗色调整、badge 文本色相关 helper。

2. `Refactor: extract panel export/capture utility pack`  
只抽 `loadScript`、`nextFrame`、`canvasToBlobPng`、scrollable state collect/restore、`downloadBlob` 和 trip-detail export 辅助。

3. `Refactor: extract panel line-header icon and station-badge enhancer`  
只抽 `enhancePanelLineHeaderIcons` 及其关联的小型 DOM 增强逻辑。

4. `Refactor: extract panel catalog subpanel controller`  
只抽 `.panel-catalog-*` 那一整块：创建、显示/隐藏、active line 同步、dismiss 状态、observer/resize 绑定。

5. `Refactor: extract panel station metadata index loaders`  
只抽 station/code/name/index/title 读取和 transfer line name map 构建，不碰 UI 事件。

6. `Refactor: extract serving-line merge and temporary through-service setup`  
只抽 `buildPanelLineMergeInfo` 和 `buildTemporaryThroughServicePanelPlan` 周边装配。

7. `Refactor: extract panel station render bootstrap controller`  
只抽 `showForStationProps` 里“重置状态 -> 拉数据 -> 组装 station 视图 -> 触发 render”的启动流程。

8. `Refactor: extract panel hover and pinned selection state machine`  
只抽 hover timer、restore timer、pinned state、interrupt rule、last key tracking。

9. `Refactor: extract panel company/line/dir intent handlers`  
只抽 body 事件命中后的 intent 解析与 handler 分发，不碰实际 DOM renderer。

10. `Refactor: extract trip-detail title and table renderer`  
只抽 trip-detail 标题、table/grid HTML 组装，继续复用现有 view-model/helper。

11. `Refactor: extract trip-detail preview payload builder`  
只抽 branch preview segment、preview payload、`buildTripPreviewKey` 周边逻辑。

12. `Refactor: extract timetable post-render hydration helpers`  
只抽 render 后的 icon 补齐、print icon wiring、focus row scroll、grid/list 补水逻辑。

13. `Refactor: extract panel scroll and active-title sync runtime`  
只抽 `scrollToLineId`、`getScrollTop`、`setScrollTop`、active title sync 一组运行时。

14. `Refactor: final panel closeout and budget ratchet`  
最后一刀，专门负责把 `panel.js` 压到新体量、收紧 budget、跑最终 smoke，并关闭这条父 issue。

**推荐执行顺序**

我建议按这个顺序推进：

`4 -> 2 -> 3 -> 13 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 14`

原因很简单：前四刀都比较孤岛，容易一轮做完，还能立刻让 `panel.js` 体积往下掉；后面再碰 station bootstrap、hover/pin、trip detail 这些更容易互相牵连的块。

**我最推荐先开的第一个 sub-issue**

先做第 `4` 个：

`Refactor: extract panel catalog subpanel controller`

这是现在最适合第一刀的，因为它：
- 边界清楚，几乎整块都在 `.panel-catalog-*`
- 能真减掉一大段 `panel.js`
- 不会一开始就碰 selection、preview、trip-detail 这些高风险状态机
- 做完以后，后续 issue 的切口会更顺

补一句：你前面那个 `TOK-134` 会和这套新父 issue 有重叠，等 Linear 恢复后，我建议把 `TOK-134` 并入这条新父 issue，不要让它单独漂着。