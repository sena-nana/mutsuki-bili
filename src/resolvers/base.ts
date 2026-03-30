import type { Context, HTTP, h } from "koishi";
import type { BiliApiClient } from "../api";
import type { RenderHelper } from "../renderer/render-helper";

export interface ResolverContext {
	api: BiliApiClient;
	http: HTTP;
	puppeteer?: Context["puppeteer"];
	renderHelper?: RenderHelper;
}

export abstract class ContentResolver<TData = unknown> {
	/** resolver 标识，用于去重键 */
	abstract readonly name: string;

	/** 高优先级匹配模式（URL 等） */
	abstract readonly patterns: RegExp[];

	/** 低优先级匹配模式（裸文本等），在所有 resolver 的 patterns 之后匹配 */
	readonly loosePatterns: RegExp[] = [];

	/** 从正则匹配结果中提取 ID（默认取 group[1]，可覆写） */
	extractId(match: RegExpMatchArray): string {
		return match[1] ?? match[0];
	}

	/** 从 ID 获取数据（匹配路径） */
	abstract fetch(id: string, ctx: ResolverContext): Promise<TData | null>;

	/** 渲染为消息元素（两条路径共用） */
	abstract render(data: TData): h[];

	/** 渲染为截图图片（可选实现，默认返回 null 走文本回退） */
	async renderImage(_data: TData, _ctx: ResolverContext): Promise<h[] | null> {
		return null;
	}
}
