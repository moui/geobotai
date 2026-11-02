# GeoBot AI Configuration Guide

GeoBot AI dynamically fetches schema information from your ArcGIS Services to understand your data. For the best experience, ensure your ArcGIS Services are configured with metadata.

## How to Configure ArcGIS Services for AI

The AI relies on **Descriptions** and **Field Aliases** to understand what your data represents without hardcoding rules.

### 1. Service/Layer Description
The AI reads the layer description to determine if a layer is relevant to a user's question.

*   **Where to edit:**
    *   **ArcGIS Pro:** Right-click Layer > Properties > Metadata > Edit the "Summary" or "Description".
    *   **ArcGIS Online/Portal:** Go to the Item Details page > Edit "Description".
*   **Best Practice:**
    *   Write natural language descriptions.
    *   *Bad:* "DATA_2023_V2"
    *   *Good:* "Points representing active fire hydrants in the city, including flow rate and last inspection date."

### 2. Field Aliases
Database column names (e.g., `POP_CNTY_20`) are often cryptic. The AI reads the **Alias** property.

*   **Where to edit:**
    *   **ArcGIS Pro:** Fields View > Change the "Alias" column.
    *   **ArcGIS Online:** Visualization Tab > Configure Pop-ups > Configure Attributes > Click a field alias to rename it.
*   **Best Practice:**
    *   *Field:* `C_TYPE` -> *Alias:* `City Classification Type`
    *   *Field:* `AVG_INC` -> *Alias:* `Average Household Income (USD)`

### 3. Coded Value Domains
If your data uses integer codes (e.g., 1=Yes, 0=No), apply a **Domain** in the geodatabase. The AI can read the domain descriptions and map user queries (e.g., "Show me yes values") to the correct integer code.

## Troubleshooting
If the bot cannot query a layer:
1.  Check that the layer URL (in `constants.ts` or Settings) is accessible.
2.  Ensure the layer supports the `Query` operation.
3.  If the layer is secured, use the `connect_to_portal` tool in the chat.
