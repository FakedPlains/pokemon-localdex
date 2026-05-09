import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { runMigrationIfNeeded } from "./utils/migrateStorage.js";
import "./styles/index.css";

// 启动时执行 localStorage 数据迁移（旧格式中文名 → 数字 ID）
// 迁移是异步的，完成后派发事件通知组件刷新
runMigrationIfNeeded().then(() => {
  // 迁移完成后派发自定义事件，让已挂载的组件可以感知数据变更
  window.dispatchEvent(new CustomEvent("localdex-migration-done"));
});

const root = createRoot(document.getElementById("root"));
root.render(<App />);
