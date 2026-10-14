# 待提交 issue（sganggs/Stronghold-Protocol）

**标题：**

```
3D 棋盘随机降级成 2D：webgl2Available() 每次调用新建 WebGL 上下文，耗尽浏览器配额后连 ?board=3d 也失效
```

**正文（从下一行开始，到分隔线结束）：**

---

## 现象

自建部署 v0.2.2，同一台设备上：

- 有时开局是 3D 棋盘，有时变成 2D；
- 加上 `?board=3d` 之后**仍然会**变 2D；
- **刷新页面有时就好**；
- `chrome://gpu` 正常，硬件加速也开着 —— 不是性能 / 核显问题（现象上和 #168 不是一回事）。

## 根因

`public/js/render/board3d/load.js` 的 `webgl2Available()` **每调用一次就新建一个 WebGL2 上下文**：

```js
export function webgl2Available(allowSlow = false) {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2', allowSlow ? {} : { failIfMajorPerformanceCaveat: true });
  if (!gl) return false;
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return true;
}
```

`loseContext()` 是**异步**的，且拿不到 `WEBGL_lose_context` 扩展时什么都不做 —— 两种情况下上下文都不会立刻归还。而浏览器同时存活的 WebGL 上下文有硬上限（Chrome 约 16 个，Safari 更少）。

调用点有三处，都可能在一次游戏里跑多次：

| 位置 | 时机 |
| --- | --- |
| `render/app.js:168` | 每次创建渲染视图（进出对局都会走） |
| `render/app.js:429` | `scheduleRecover()` 重试，最多 3 次（`BOARD3D_RETRY_MS = [1200, 4000, 12000]`） |
| `render/app.js:1873` | 每次 `setBoardMode('3d')` |

反复进出几局之后配额就见底了。此后 `getContext('webgl2')` **恒返回 null**，探测直接报告"不支持"，3D 棋盘退回 2D。

项目里其实已经知道这条路径：`render/app.js:409` 的注释写着 `WebGL context of the 3D board lost (GPU reset, driver, too many contexts)` —— 只是探测函数本身就是 "too many contexts" 的来源之一。

### 为什么 `?board=3d` 救不了

`allowSlow` 只把探测参数从 `{ failIfMajorPerformanceCaveat: true }` 换成 `{}`，也就是"别嫌弃软件渲染的慢 GPU"。它对**上下文数量上限**没有任何作用，配额耗尽时不管传什么参数都返回 null。

### 为什么刷新就好

刷新会销毁页面上全部上下文，配额归零。

### 对照：3D 棋盘本身没有泄漏

`board3d/scene.js` 的 `destroy()` 规规矩矩调了 `renderer.dispose()` 和 `forceContextLoss()`。整条链路里只有这个探测函数在漏。

## 自查方法

在已经变成 2D 的页面上打开控制台：

```js
(() => {
  let ok = 0, fail = 0;
  for (let i = 0; i < 24; i++) {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) { ok++; gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    else fail++;
  }
  console.log(`新建成功 ${ok} 次，失败 ${fail} 次`);
})();
```

输出"前面成功、后面失败"（比如 `成功 3 次，失败 21 次`）就说明配额已经耗尽。刚刷新的正常页面上应该能连开 10 次以上。
（这段脚本本身也消耗配额，跑完记得刷新。）

## 建议修复

探测改成**整个页面只做一次**，代价是常駐 1～2 个上下文：

```js
let probeStrict = null; // proven without the performance caveat
let probeSlow = null;   // proven allowing software rendering (a strict pass counts as one)
const forgetProbes = () => { probeStrict = null; probeSlow = null; };

export function webgl2Available(allowSlow = false) {
  try {
    if (typeof document === 'undefined') return false;
    if (allowSlow ? probeSlow : probeStrict) return true;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', allowSlow ? {} : { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    // a lost context (GPU reset) invalidates the proof: the next call probes again
    c.addEventListener('webglcontextlost', forgetProbes, { once: true });
    if (allowSlow) probeSlow = gl;
    else { probeStrict = gl; probeSlow = gl; }
    return true;
  } catch { return false; }
}
```

两点说明：

- 分开缓存 strict / slow，是为了不让"宽松探测成功"污染严格探测的结果 —— 否则默认行为会把软件渲染的设备也拉进 3D。
- 监听 `webglcontextlost` 把缓存作废，GPU 重置后能重新探测。

我自己的部署上已经打了这个补丁，需要的话我可以整理成 PR。

## 环境

- 版本 v0.2.2
- 复现设备：iPad（Safari）、Android 平板（Chrome）
- 桌面 Chrome 上不容易触发（配额更高、`loseContext()` 回收更及时），所以这个问题主要表现为"移动端 / 平板上时好时坏"

---

## 提交方式 A：给我一个 PAT，我来提

1. https://github.com/settings/personal-access-tokens → **Fine-grained tokens** → Generate new token
2. Resource owner 选你自己，Repository access 选 **Only select repositories** → `sganggs/Stronghold-Protocol`
3. Permissions → Repository permissions → **Issues: Read and write**
4. 生成后把 token 给我，我立刻提交并把结果回给你（用完建议立刻 revoke）

## 提交方式 B：自己粘贴

打开 https://github.com/sganggs/Stronghold-Protocol/issues/new ，把上面的标题和正文贴进去即可。
