import React from "react";
export const formatEventDescription = (description) => {
    // Remove lines of underscores/dashes (typically 20+ characters)
    const cleanedDescription = description.replace(/_{20,}|[-_]{20,}/g, '');
    // Split into lines and filter out empty lines
    const lines = cleanedDescription.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
        // Handle Teams meeting format: "Text<URL>" 
        const teamsLinkRegex = /([^<]+)<(https?:\/\/[^>]+)>/g;
        const urlOnlyRegex = /(https?:\/\/[^\s<>]+)/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        // First check for Teams format links
        while ((match = teamsLinkRegex.exec(line)) !== null) {
            // Add text before the link
            if (match.index > lastIndex) {
                parts.push(line.slice(lastIndex, match.index));
            }
            const displayText = match[1]?.trim() || 'Link';
            const url = match[2];
            parts.push(<a key={`${index}-teams-${match.index}`} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline" onClick={(e) => e.stopPropagation()}>
          {displayText}
        </a>);
            lastIndex = match.index + match[0].length;
        }
        // If no Teams format links were found, check for standalone URLs
        if (parts.length === 0) {
            while ((match = urlOnlyRegex.exec(line)) !== null) {
                // Add text before the URL
                if (match.index > lastIndex) {
                    parts.push(line.slice(lastIndex, match.index));
                }
                const url = match[0];
                parts.push(<a key={`${index}-url-${match.index}`} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline" onClick={(e) => e.stopPropagation()}>
            Link
          </a>);
                lastIndex = match.index + match[0].length;
            }
        }
        // Add remaining text
        if (lastIndex < line.length) {
            parts.push(line.slice(lastIndex));
        }
        // If no links were found, return the original line
        if (parts.length === 0) {
            parts.push(line);
        }
        return (<div key={index} className="mb-1">
        {parts}
      </div>);
    });
};
