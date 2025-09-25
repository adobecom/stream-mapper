import { handleComponents } from '../components/components.js';

export async function mapMarqueeContent(blockContent, figContent) {
    const properties = figContent?.details?.properties;
    if (!properties) return;
    try {
        const { getConfig } = await import('../utils/utils.js');
        const config = await getConfig();

        const mappingUrl = `${config.streamMapper.blockMappingsUrl}/marquee.json`;
        const response = await fetch(mappingUrl);
        const mappingData = await response.json();
        
        mappingData.data.forEach(mappingConfig => {
            const value = properties[mappingConfig.key];
            const element = blockContent.querySelector(mappingConfig.selector);
            if (!element) return;
            handleComponents(element, value, mappingConfig);
        });
    } catch (error) {
        console.warn('Could not load marquee mapping:', error);
    }
}
