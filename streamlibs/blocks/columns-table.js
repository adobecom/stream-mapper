const CONTAINED_CLASS = 'contained';

function handleVariants(blockContent, properties) {
  if (properties?.colorTheme) blockContent.classList.add(properties.colorTheme);
  if (properties?.miloTag.toLowerCase().includes(CONTAINED_CLASS)) {
    blockContent.classList.add(CONTAINED_CLASS);
  }
}

function handleColumns(hasCols, cols, rowDiv) {
  hasCols.forEach((hasCol, idxc) => {
    if (!hasCol) return;
    const colDiv = document.createElement('div');
    rowDiv.appendChild(colDiv);
    if (cols[idxc]?.heading) colDiv.innerHTML = cols[idxc].heading;
    if (cols[idxc]?.body) colDiv.innerHTML = cols[idxc]?.body;
  });
}

export default async function mapBlockContent(sectionWrapper, blockContent, figContent) {
  const properties = figContent?.details?.properties;
  if (!properties) return;
  try {
    const { hasRows, hasCols } = properties;
    if (properties.hasRowHeader) {
      const rowDiv = document.createElement('div');
      blockContent.appendChild(rowDiv);
      handleColumns(hasCols, properties.header, rowDiv);
    }
    hasRows.forEach((hasRow, idxr) => {
      if (!hasRow) return;
      const rowDiv = document.createElement('div');
      blockContent.appendChild(rowDiv);
      const cols = properties.rows[idxr]['cols-variant-1'] ? properties.rows[idxr]['cols-variant-1'] : properties.rows[idxr]['cols-variant-2'];
      handleColumns(hasCols, cols, rowDiv);
    });
    handleVariants(blockContent, properties);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
  }
}
