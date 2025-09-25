export async function mapAsideContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    
    try {
        const { getConfig } = await import('../utils/utils.js');
        const config = await getConfig();
        const mappingUrl = `${config.streamMapper.blockMappingsUrl}/aside.json`;
        
        const response = await fetch(mappingUrl);
        const mappingData = await response.json();
        
        mappingData.data.forEach(mappingConfig => {
            const value = properties[mappingConfig.key];
            if (value === undefined) return;
            
            const element = blockContent.querySelector(mappingConfig.selector);
            if (!element) return;
            
            applyMapping(element, value, mappingConfig);
        });
    } catch (error) {
        console.warn('Could not load aside mapping:', error);
    }
}

function applyMapping(element, value, mappingConfig) {
    const { type } = mappingConfig;
    
    switch (type) {
        case 'text':
            if (value === '') {
                element.remove();
            } else {
                element.innerHTML = value;
            }
            break;
            
        case 'img':
            if (value === '') {
                element.remove();
            } else {
                element.src = value;
            }
            break;
            
        case 'a':
            if (value === '') {
                element.remove();
            } else {
                element.href = value;
            }
            break;
            
        default:
            console.warn(`Unknown mapping type: ${type}`);
    }
}
