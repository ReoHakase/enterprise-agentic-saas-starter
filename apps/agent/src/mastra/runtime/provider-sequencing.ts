export const startAgentProvidersSerially = async <Title, Product>({
  generateTitle,
  startProduct,
}: {
  generateTitle: () => Promise<Title>
  startProduct: () => Promise<Product>
}): Promise<{ product: Product; title: Title }> => {
  const title = await generateTitle()
  const product = await startProduct()
  return { product, title }
}
