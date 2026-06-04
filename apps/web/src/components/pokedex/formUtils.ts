/**
 * 图鉴列表的形态名展示格式化工具
 *
 * 供 PokedexCardList / PokedexTableList 等列表组件共用，
 * 避免形态名规则调整时多处改漏。
 */

/** 从完整形态名中提取括号内的短名称，如 "洛托姆(清洗洛托姆)" → "清洗洛托姆" */
export function getShortFormName(formName: string): string {
  const match = formName.match(/[（(](.+?)[）)]/);
  return match ? match[1] : formName;
}
