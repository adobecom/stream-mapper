export async function mapMarqueeContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    
    try {
        const { getConfig } = await import('../utils.js');
        const config = await getConfig();
        const mappingUrl = `${config.streamMapper.blockMappingsUrl}/marquee.json`;
        
        const response = await fetch(mappingUrl);
        const mappingData = await response.json();
        
        Object.keys(properties).forEach(key => {
            const mappingConfig = mappingData.data.find(item => item.key === key);
            if (!mappingConfig) return;
            
            const element = blockContent.querySelector(mappingConfig.selector);
            if (!element) return;
            
            applyMapping(element, properties[key], mappingConfig);
        });
    } catch (error) {
        console.warn('Could not load marquee mapping:', error);
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
