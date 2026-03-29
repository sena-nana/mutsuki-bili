import { type Context, Logger } from "koishi";
import type {} from "koishi-plugin-puppeteer";
import type { Page } from "puppeteer-core";
import type {
	MihuashiProfileNotification,
	MihuashiStallNotification,
} from "./types";

const logger = new Logger("mutsuki-bili/mihuashi");

const SCRAPE_TIMEOUT = 15_000;

export class MihuashiScraper {
	constructor(private ctx: Context) {}

	get available(): boolean {
		return !!this.ctx.puppeteer;
	}

	/** 抓取画师主页信息 */
	async scrapeProfile(id: string): Promise<MihuashiProfileNotification | null> {
		if (!this.available) return null;
		let page: Page | null = null;
		try {
			page = await this.ctx.puppeteer.page();
			await page.setViewport({ width: 1280, height: 800 });
			await page.goto(`https://www.mihuashi.com/profiles/${id}`, {
				waitUntil: "networkidle2",
				timeout: SCRAPE_TIMEOUT,
			});

			// 等待主要内容渲染
			await page
				.waitForSelector(
					'.profile-header, .user-info, .artist-name, [class*="profile"], [class*="artist"], [class*="userName"]',
					{ timeout: 8000 },
				)
				.catch(() => {});

			const data = await page.evaluate(() => {
				// 画师名称：尝试多种选择器
				const nameEl =
					document.querySelector(
						'.artist-name, .user-name, .profile-name, [class*="userName"], [class*="artistName"], [class*="nickname"]',
					) ?? document.querySelector("h1, h2");
				const name = nameEl?.textContent?.trim() ?? "";

				// 头像
				const avatarEl = document.querySelector(
					'.avatar img, .profile-avatar img, [class*="avatar"] img, [class*="Avatar"] img',
				);
				const avatarUrl = avatarEl?.getAttribute("src") ?? "";

				// 简介
				const bioEl = document.querySelector(
					'.bio, .profile-bio, .introduction, [class*="introduction"], [class*="bio"], [class*="desc"]',
				);
				const bio = bioEl?.textContent?.trim() ?? "";

				// 标签
				const tagEls = document.querySelectorAll(
					'.tag, .skill-tag, [class*="tag"] span, [class*="Tag"]',
				);
				const tags = Array.from(tagEls)
					.map((el) => el.textContent?.trim() ?? "")
					.filter(Boolean);

				return { name, avatarUrl, bio, tags };
			});

			if (!data.name) {
				logger.debug("米画师画师页面未解析到名称 (id=%s)", id);
				return null;
			}

			return { type: "mhs_profile", id, ...data };
		} catch (err) {
			logger.debug("米画师画师页面抓取失败 (id=%s): %s", id, String(err));
			return null;
		} finally {
			if (page) {
				try {
					await page.close();
				} catch {}
			}
		}
	}

	/** 抓取橱窗信息 */
	async scrapeStall(id: string): Promise<MihuashiStallNotification | null> {
		if (!this.available) return null;
		let page: Page | null = null;
		try {
			page = await this.ctx.puppeteer.page();
			await page.setViewport({ width: 1280, height: 800 });
			await page.goto(`https://www.mihuashi.com/stalls/${id}`, {
				waitUntil: "networkidle2",
				timeout: SCRAPE_TIMEOUT,
			});

			// 等待主要内容渲染
			await page
				.waitForSelector(
					'[class*="stall"], [class*="Stall"], [class*="showcase"], h1, h2',
					{ timeout: 8000 },
				)
				.catch(() => {});

			const data = await page.evaluate(() => {
				// 橱窗标题
				const titleEl = document.querySelector(
					'[class*="stallName"], [class*="title"], h1, h2',
				);
				const title = titleEl?.textContent?.trim() ?? "";

				// 封面图
				const coverEl =
					document.querySelector(
						'[class*="cover"] img, [class*="Cover"] img, [class*="banner"] img, .stall-cover img',
					) ??
					document.querySelector(
						'[class*="artwork"] img, [class*="gallery"] img',
					);
				const coverUrl = coverEl?.getAttribute("src") ?? "";

				// 画师名称
				const artistEl = document.querySelector(
					'[class*="artistName"], [class*="userName"], [class*="author"], .artist-name',
				);
				const artistName = artistEl?.textContent?.trim() ?? "";

				// 价格
				const priceEl = document.querySelector(
					'[class*="price"], [class*="Price"]',
				);
				const price = priceEl?.textContent?.trim() ?? "";

				// 状态（开放/关闭/排队中等）
				const statusEl = document.querySelector(
					'[class*="status"], [class*="Status"], [class*="state"]',
				);
				const status = statusEl?.textContent?.trim() ?? "";

				return { title, coverUrl, artistName, price, status };
			});

			if (!data.title) {
				logger.debug("米画师橱窗页面未解析到标题 (id=%s)", id);
				return null;
			}

			return { type: "mhs_stall", id, ...data };
		} catch (err) {
			logger.debug("米画师橱窗页面抓取失败 (id=%s): %s", id, String(err));
			return null;
		} finally {
			if (page) {
				try {
					await page.close();
				} catch {}
			}
		}
	}
}
