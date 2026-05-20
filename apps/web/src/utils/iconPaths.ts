export function typeIconSrc(typeName: string): string {
  return `${import.meta.env.BASE_URL}assets/type-icons/type-${typeName}@sm.png`;
}

export function categoryIconSrc(category: string): string {
  return `${import.meta.env.BASE_URL}assets/type-icons/category-${category}@sm.png`;
}
