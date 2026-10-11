import assert from 'node:assert/strict';

import { createPanelMarqueeController } from '../src/features/panel/panelInteractionView.js';

const createFixture = () => {
    const animationLog = [];
    const frames = new Map();
    let frameId = 0;

    class Element {
        constructor(classes = '', width = 80) {
            this.classes = new Set(classes.split(' '));
            this.classList = { contains: (name) => this.classes.has(name) };
            this.children = [];
            this.parent = null;
            this.connected = true;
            this.clientWidth = width;
            this.scrollWidth = width;
            this.offsetWidth = width;
            this.style = {};
            this.listeners = new Map();
        }
        get isConnected() {
            return this.connected && (!this.parent || this.parent.isConnected);
        }
        append(child) {
            child.parent = this;
            this.children.push(child);
            return child;
        }
        contains(element) {
            return element === this || this.children.some((child) => child.contains(element));
        }
        matches(selector) {
            return selector.split(',').some((part) => part.trim().split('.').filter(Boolean)
                .every((name) => this.classes.has(name)));
        }
        querySelectorAll(selector) {
            return this.children.flatMap((child) => [
                ...(child.matches(selector) ? [child] : []),
                ...child.querySelectorAll(selector)
            ]);
        }
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        }
        closest(selector) {
            return this.matches(selector) ? this : this.parent?.closest(selector);
        }
        getBoundingClientRect() {
            return { width: this.offsetWidth, top: 0, bottom: 20 };
        }
        addEventListener(type, listener) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(listener);
        }
        removeEventListener(type, listener) {
            this.listeners.get(type)?.delete(listener);
        }
        dispatch(type) {
            for (const listener of this.listeners.get(type) || []) listener();
        }
        animate(keyframes, options) {
            const animation = {
                target: this,
                keyframes,
                options,
                playState: 'running',
                cancel() { this.playState = 'idle'; }
            };
            animationLog.push(animation);
            return animation;
        }
    }

    const makeMarquee = (parent, className, contentWidth = 140) => {
        const marquee = parent.append(new Element(className));
        marquee.append(new Element(`${className}-inner`, contentWidth));
        return marquee;
    };
    const root = new Element();
    const header = makeMarquee(root, 'panel-dir-marquee');
    makeMarquee(root, 'panel-dir-marquee', 60);
    const timetable = root.append(new Element('panel-timetable is-expanded'));
    const addRow = () => {
        const row = timetable.append(new Element('panel-timetable-row'));
        makeMarquee(row, 'panel-timetable-dest-marquee');
        makeMarquee(row, 'panel-timetable-type-marquee');
        return row;
    };
    addRow();

    const controller = createPanelMarqueeController({
        win: {
            Element,
            requestAnimationFrame(callback) {
                frames.set(++frameId, callback);
                return frameId;
            },
            cancelAnimationFrame(id) { frames.delete(id); },
            matchMedia: () => ({ matches: false })
        }
    });
    const flushFrame = () => {
        const callbacks = Array.from(frames.values());
        frames.clear();
        for (const callback of callbacks) callback();
    };
    const flushSchedule = () => { flushFrame(); flushFrame(); };
    const activeAnimations = () => animationLog.filter((animation) => animation.playState === 'running');
    const listenerCount = () => timetable.listeners.get('scroll')?.size || 0;
    return {
        root, header, timetable, controller, frames, animationLog,
        addRow, flushFrame, flushSchedule, activeAnimations, listenerCount
    };
};

{
    const fixture = createFixture();
    const { controller, root, timetable, frames, animationLog, activeAnimations, listenerCount } = fixture;
    controller.schedule(root);
    fixture.flushFrame();
    assert.equal(animationLog.length, 0, '第一帧只等待布局稳定，不创建动画');
    fixture.flushFrame();
    assert.equal(activeAnimations().length, 3, '方向、终点及种别溢出文本均继续动画，未溢出文本保持静止');
    assert.deepEqual(activeAnimations().map((animation) => animation.options.duration), [7714, 7714, 8000]);
    assert.ok(activeAnimations().every((animation) => animation.options.iterations === Infinity));
    assert.equal(listenerCount(), 1);

    timetable.dispatch('scroll');
    timetable.dispatch('scroll');
    assert.equal(frames.size, 1, '同一滚动容器每帧只测量一次');
    controller.schedule(timetable);
    const staleCallbacks = Array.from(frames.values());
    const staleListener = Array.from(timetable.listeners.get('scroll'))[0];
    controller.cleanup(timetable);
    assert.equal(frames.size, 0, '局部清理取消滚动和测量帧');
    assert.equal(listenerCount(), 0, '局部清理移除滚动监听');
    assert.equal(activeAnimations().length, 1, '清理时刻表时保留其他区域的方向动画');
    assert.ok(fixture.header.contains(activeAnimations()[0].target));
    for (const callback of staleCallbacks) callback();
    staleListener();
    assert.equal(frames.size, 0, '失效的回调与监听不能重新排队');
    assert.equal(activeAnimations().length, 1);

    controller.schedule(root);
    fixture.flushSchedule();
    assert.equal(listenerCount(), 1, '清理后的容器恢复时重新绑定一次监听');
    assert.equal(activeAnimations().length, 3);
    controller.destroy();
}

{
    const fixture = createFixture();
    const { controller, root, frames, animationLog } = fixture;
    controller.schedule(root);
    fixture.flushFrame();
    const secondFrame = Array.from(frames.values())[0];
    controller.cleanup(root);
    controller.schedule(root);
    secondFrame();
    assert.equal(animationLog.length, 0, '旧的第二帧不能越过清理启动动画');
    assert.equal(frames.size, 1, '旧回调不能取消新一轮测量');
    fixture.flushSchedule();
    assert.equal(fixture.activeAnimations().length, 3);
    controller.destroy();
}

{
    const fixture = createFixture();
    const { controller, root, timetable, frames } = fixture;
    controller.schedule(root);
    fixture.flushSchedule();
    timetable.dispatch('scroll');
    const staleScrollFrame = Array.from(frames.values())[0];
    controller.suspend();
    assert.equal(fixture.activeAnimations().length, 0, '隐藏或后台暂停时释放全部无限动画');
    assert.equal(frames.size, 0);
    assert.equal(fixture.listenerCount(), 0);
    controller.schedule(root);
    controller.hookTimetableScrollMarquee(root);
    assert.equal(controller.applyDirHeaderMarquees(root), 0);
    assert.equal(controller.applyTimetableDestMarquees(root), 0);
    staleScrollFrame();
    assert.equal(frames.size, 0, '暂停时所有入口和旧回调都保持静止');

    controller.resume();
    controller.schedule(root);
    fixture.flushSchedule();
    assert.equal(fixture.activeAnimations().length, 3, '可见后通过当前 DOM 恢复动画');
    assert.equal(fixture.listenerCount(), 1);
    timetable.dispatch('scroll');
    controller.schedule(root);
    const staleDestroyCallbacks = Array.from(frames.values());
    controller.destroy();
    controller.resume();
    controller.schedule(root);
    for (const callback of staleDestroyCallbacks) callback();
    assert.equal(fixture.activeAnimations().length, 0, '销毁后不能恢复动画');
    assert.equal(frames.size, 0);
    assert.equal(fixture.listenerCount(), 0);
}

{
    const fixture = createFixture();
    const { controller, root, timetable } = fixture;
    controller.schedule(root);
    fixture.flushSchedule();
    for (let replacement = 0; replacement < 25; replacement += 1) {
        controller.cleanup(timetable);
        for (const row of timetable.children) {
            row.connected = false;
            row.parent = null;
        }
        timetable.children = [];
        fixture.addRow();
        controller.schedule(root);
        fixture.flushSchedule();
        assert.equal(fixture.activeAnimations().length, 3, '重复替换内容后动画数量保持稳定');
        assert.ok(fixture.activeAnimations().every((animation) => animation.target.isConnected));
        assert.equal(fixture.listenerCount(), 1);
    }
    controller.destroy();
    assert.equal(fixture.activeAnimations().length, 0);
}

{
    const fixture = createFixture();
    fixture.controller.schedule(fixture.root);
    fixture.flushFrame();
    fixture.root.connected = false;
    fixture.flushFrame();
    assert.equal(fixture.activeAnimations().length, 0, '测量期间被移除的根节点不能启动动画');
    fixture.controller.destroy();
}

console.log('面板跑马灯生命周期回归通过');
