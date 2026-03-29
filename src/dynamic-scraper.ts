import { type Context, Logger } from "koishi";
import type {} from "koishi-plugin-puppeteer";
import type { HTTPResponse, Page } from "puppeteer-core";
import type { AuthManager } from "./auth";
import { COMMON_HEADERS } from "./auth";
import type { Config } from "./index";
import type { DynamicFeedData, DynamicItem } from "./types";

const logger = new Logger("mutsuki-bili/scraper");

/** 同一 UID 的浏览器回退最小间隔 */
const SCRAPE_COOLDOWN = 60_000;

/** 网络拦截后等待延迟响应的时间 */
const NETWORK_SETTLE_DELAY = 2000;

export class DynamicScraper {
	private lastScrapeTime = new Map<string, number>();

	constructor(
		private ctx: Context,
		private auth: AuthManager,
		private config: Config,
	) {}

	/** puppeteer 服务是否可用且配置允许回退 */
	get available(): boolean {
		return this.config.puppeteer.fallback && !!this.ctx.puppeteer;
	}

	async scrapeUserDynamics(uid: string): Promise<{
		items: DynamicItem[];
		offset: string;
		hasMore: boolean;
	} | null> {
		if (!this.available) {
			logger.warn("puppeteer 服务不可用，无法使用浏览器回退");
			return null;
		}

		const now = Date.now();
		const lastTime = this.lastScrapeTime.get(uid) ?? 0;
		if (now - lastTime < SCRAPE_COOLDOWN) {
			logger.debug("UID %s 浏览器回退冷却中，跳过", uid);
			return null;
		}
		this.lastScrapeTime.set(uid, now);

		let page: Page | null = null;
		try {
			page = await this.ctx.puppeteer.page();

			await this.applyStealthScripts(page);
			await page.setViewport({ width: 1920, height: 1080 });
			await page.setUserAgent(COMMON_HEADERS["User-Agent"]);
			await this.injectCookies(page);

			const captured = await this.navigateAndCapture(page, uid);
			if (captured && captured.items.length > 0) {
				logger.info(
					"浏览器回退成功获取 %d 条动态 (uid=%s)",
					captured.items.length,
					uid,
				);
				return captured;
			}

			logger.debug("网络拦截未获取到数据，尝试 DOM 解析 (uid=%s)", uid);
			const domItems = await this.extractFromDOM(page);
			if (domItems.length > 0) {
				logger.info("DOM 解析获取 %d 条动态 (uid=%s)", domItems.length, uid);
				return { items: domItems, offset: "", hasMore: false };
			}

			logger.warn("浏览器回退未能获取任何动态数据 (uid=%s)", uid);
			return null;
		} catch (err) {
			logger.warn("浏览器回退异常 (uid=%s): %s", uid, String(err));
			return null;
		} finally {
			if (page) {
				try {
					await page.close();
				} catch {}
			}
		}
	}

	private async applyStealthScripts(page: Page): Promise<void> {
		await page.evaluateOnNewDocument(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => false });

			Object.defineProperty(navigator, "plugins", {
				get: () => {
					const plugins = [
						{
							name: "Chrome PDF Plugin",
							filename: "internal-pdf-viewer",
							description: "Portable Document Format",
						},
						{
							name: "Chrome PDF Viewer",
							filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
							description: "",
						},
						{
							name: "Native Client",
							filename: "internal-nacl-plugin",
							description: "",
						},
					];
					Object.setPrototypeOf(plugins, PluginArray.prototype);
					return plugins;
				},
			});

			Object.defineProperty(navigator, "languages", {
				get: () => ["zh-CN", "zh", "en"],
			});

			(window as Window & { chrome?: unknown }).chrome = {
				runtime: {},
				loadTimes: () => ({}),
				csi: () => ({}),
			};

			const originalQuery = navigator.permissions.query.bind(
				navigator.permissions,
			);
			(navigator.permissions.query as Permissions["query"]) = (params) => {
				if (params.name === "notifications") {
					return Promise.resolve({
						state: "denied",
						onchange: null,
					} as PermissionStatus);
				}
				return originalQuery(params);
			};

			delete (Object.getPrototypeOf(navigator) as Record<string, unknown>)
				.webdriver;
		});
	}

	private async injectCookies(page: Page): Promise<void> {
		const cookieHeader = await this.auth.buildCookieHeader();
		if (!cookieHeader) return;

		const cookies = cookieHeader
			.split("; ")
			.map((pair) => {
				const eqIdx = pair.indexOf("=");
				if (eqIdx === -1) return null;
				return {
					name: pair.slice(0, eqIdx),
					value: pair.slice(eqIdx + 1),
					domain: ".bilibili.com",
					path: "/",
				};
			})
			.filter((c): c is NonNullable<typeof c> => c !== null);

		if (cookies.length > 0) {
			await page.setCookie(...cookies);
		}
	}

	private async navigateAndCapture(
		page: Page,
		uid: string,
	): Promise<{
		items: DynamicItem[];
		offset: string;
		hasMore: boolean;
	} | null> {
		let captured: {
			items: DynamicItem[];
			offset: string;
			hasMore: boolean;
		} | null = null;

		page.on("response", async (response: HTTPResponse) => {
			try {
				const url = response.url();
				if (url.includes("x/polymer/web-dynamic/v1/feed/space")) {
					const json = await response.json();
					if (json?.code === 0 && json?.data) {
						const data = json.data as DynamicFeedData;
						captured = {
							items: data.items ?? [],
							offset: data.offset ?? "",
							hasMore: data.has_more ?? false,
						};
					}
				}
			} catch {}
		});

		const timeout = this.config.puppeteer.timeout ?? 30_000;
		await page.goto(`https://space.bilibili.com/${uid}/dynamic`, {
			waitUntil: "networkidle0",
			timeout,
		});

		await new Promise<void>((resolve) =>
			setTimeout(resolve, NETWORK_SETTLE_DELAY),
		);
		return captured;
	}

	private async extractFromDOM(page: Page): Promise<DynamicItem[]> {
		try {
			await page.waitForSelector(".bili-dyn-list__item", { timeout: 10_000 });
		} catch {
			return [];
		}

		return page.evaluate(() => {
			const cards = document.querySelectorAll(".bili-dyn-list__item");
			const items: DynamicItem[] = [];

			for (const card of cards) {
				const dynLink = card.querySelector(
					'a[href*="t.bilibili.com"], a[href*="bilibili.com/opus/"]',
				);
				const href = dynLink?.getAttribute("href") ?? "";
				const idMatch = href.match(
					/(?:t\.bilibili\.com|bilibili\.com\/opus)\/(\d+)/,
				);
				const idStr = idMatch?.[1] ?? "";
				if (!idStr) continue;

				const authorName =
					card.querySelector(".bili-dyn-title__text")?.textContent?.trim() ??
					"";
				const authorFaceEl = card.querySelector(
					".bili-dyn-avatar .b-img__inner img, .bili-dyn-avatar img",
				);
				const authorFace = authorFaceEl?.getAttribute("src") ?? "";
				const richText = card.querySelector(".bili-rich-text");
				const text = richText?.textContent?.trim() ?? "";

				const imgEls = card.querySelectorAll(
					".bili-album__preview img, .bili-dyn-card-orig__img img",
				);
				const images = Array.from(imgEls)
					.map((el) => (el as HTMLImageElement).getAttribute("src") ?? "")
					.filter(Boolean);

				const videoCard = card.querySelector(".bili-dyn-card-video");
				let archive:
					| { cover: string; title: string; desc: string; jump_url: string }
					| undefined;
				if (videoCard) {
					archive = {
						cover:
							videoCard
								.querySelector(".b-img__inner img")
								?.getAttribute("src") ?? "",
						title:
							videoCard
								.querySelector(".bili-dyn-card-video__title")
								?.textContent?.trim() ?? "",
						desc: "",
						jump_url: videoCard.querySelector("a")?.getAttribute("href") ?? "",
					};
				}

				const opusCard = card.querySelector(".bili-dyn-card-opus");
				let opus:
					| {
							summary?: { text: string };
							pics?: Array<{ url: string }>;
							jump_url: string;
					  }
					| undefined;
				if (opusCard) {
					const opusPicEls = opusCard.querySelectorAll(
						".bili-album__preview img, .bili-dyn-card-opus__cover img",
					);
					opus = {
						summary: {
							text:
								opusCard
									.querySelector(".bili-rich-text")
									?.textContent?.trim() ?? "",
						},
						pics: Array.from(opusPicEls)
							.map((el) => ({
								url: (el as HTMLImageElement).getAttribute("src") ?? "",
							}))
							.filter((p) => p.url),
						jump_url: href,
					};
				}

				const hasMajor = archive || images.length > 0 || opus;
				items.push({
					id_str: idStr,
					type: archive
						? "DYNAMIC_TYPE_AV"
						: images.length
							? "DYNAMIC_TYPE_DRAW"
							: "DYNAMIC_TYPE_WORD",
					modules: {
						module_author: { name: authorName, face: authorFace, pub_ts: 0 },
						module_dynamic: {
							desc: text ? { text } : undefined,
							major: hasMajor
								? {
										type: archive
											? "MAJOR_TYPE_ARCHIVE"
											: opus
												? "MAJOR_TYPE_OPUS"
												: "MAJOR_TYPE_DRAW",
										archive,
										draw:
											images.length > 0
												? { items: images.map((src) => ({ src })) }
												: undefined,
										opus,
									}
								: undefined,
						},
					},
				});
			}

			return items;
		});
	}
}
