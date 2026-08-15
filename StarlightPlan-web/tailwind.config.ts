import type { Config } from "tailwindcss";

/**
 * Tailwind CSS v4 配置
 * 主题（颜色/字体）已迁移至 app/globals.css 的 @theme 块中，
 * 此文件仅保留最小声明以满足构建工具的类型检查。
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};

export default config;
