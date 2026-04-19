/**
 * 媒体常量 - 使用 CDN URL
 * 仅保留图片类（.png）：企微 bot markdown v2 可直接渲染
 * 视频类（.mp4）已移除：企微 bot 不支持渲染视频
 */
export const MEDIA = {
    // ── 开局类（图片 URL，markdown 可直接渲染）──
    ONBOARDING_ORIGIN: "![选择出身之地](https://cdn.superintern.ai/media/chat_history_images/63d9da3c-3ab6-488e-aaca-9bcd07c782ca/014ddaa2-bd24-4b2d-9cec-20c0a8c38fd6.png)",
    ONBOARDING_ATTRS: "![先天属性](https://cdn.superintern.ai/media/chat_history_images/b5b3a7f4-5254-4983-aa61-3618b7b6902c/2d7c79e4-0f26-4b49-9adb-e34861476ed3.png)",
    ONBOARDING_DESTINY: "![三选一](https://cdn.superintern.ai/media/chat_history_images/98dde6fd-ba97-42a7-b3d4-2b9368ad28d5/6792e0ea-9a83-45e8-a8f8-05c0d0a0870c.png)",
};
export function appendMedia(list, ...items) {
    const set = new Set(list);
    for (const item of items) {
        if (item)
            set.add(item);
    }
    return [...set];
}
