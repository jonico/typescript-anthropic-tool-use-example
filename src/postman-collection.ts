import { z } from 'zod';

type CollectionInfo = {
  _postman_id: string;
  name: string;
  description: string;
  schema: string;
  updatedAt: string;
  createdAt: string;
  lastUpdatedBy: string;
  uid: string;
};

type Request = {
  name: string;
  id?: string;
  description?: string;
  method?: string;
  url?: {
    raw?: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: Array<{ key: string; value: string; }>;
  };
  header?: Array<{ key: string; value: string; }>;
  body?: {
    mode?: string;
    raw?: string;
    options?: {
      raw?: {
        language: string;
      };
    };
  };
};

type CollectionItem = {
  name: string;
  item?: CollectionItem[]; // For folders
  request?: Request;       // For requests
  id?: string;
  description?: string;
  uid?: string;
  auth?: {
    type: 'apikey';
    apikey: Array<{
      key: string;
      value: string;
      type: string;
    }>;
  };
};

type CollectionResponse = {
  collection: {
    info: CollectionInfo;
    item: CollectionItem[];
    variable?: Array<{ key: string; value: string; type: string }>;
    auth?: {
      type: 'apikey';
      apikey: Array<{
        key: string;
        value: string;
        type: string;
      }>;
    };
    events?: Array<{
      listen: string;
      script: {
        id: string;
        type: string;
        exec: string[];
      };
    }>;
  };
};

type FunctionParams = {
  collectionId: string;
  access_key?: string;
  model?: 'minimal';
};

// Add zod schema for validation
export const getCollectionZodSchema = {
  collectionId: z.string().describe('The mandatory ID / UID  of the collection to retrieve.'),
  access_key: z.string().optional().describe('A collection\'s read-only access key (optional).'),
  model: z.enum(['minimal']).optional().describe('Return a minimal representation of the collection (optional).')
};

// Helper function to recursively format collection items and their requests
const formatCollectionItems = (items: CollectionItem[]): string => {
  return items.map(item => {
    let result = `\n${item.name}`;
    if (item.description) {
      result += `\n  Description: ${item.description}`;
    }
    if (item.id) {
      result += `\n  ID: ${item.id}`;
    }
    if (item.uid) {
      result += `\n  Full UID: ${item.uid}`;
    }
    // Add request information
    if (item.request) {
      result += '\n  Request:';
      if (item.request.method) {
        result += `\n    - Method: ${item.request.method}`;
      }
      if (item.request.url) {
        const url = item.request.url;
        if (url.raw) {
          result += `\n    - URL: ${url.raw}`;
        }
      }
    }
    // Recursively format sub-items (folders and their requests)
    if (item.item && item.item.length > 0) {
      result += `\n  Sub-items:${formatCollectionItems(item.item)}`;
    }
    return result;
  }).join('\n\n---');
};

// Helper function to get root level folders
const formatRootLevelFolders = (items: CollectionItem[]): string => {
  if (!items || items.length === 0) return 'No top-level folders';

  return items
    .filter(item => item.item) // Only get folders (items with sub-items)
    .map(folder => `- ${folder.name}${folder.description ? `\n  Description: ${folder.description}` : ''}`)
    .join('\n');
};

// Helper function to get Postman view URL
const getPostmanViewUrl = (collectionId: string) => {
  const teamDomain = process.env.POSTMAN_TEAM_DOMAIN || 'insurance-demo.postman.co';
  return `https://${teamDomain}/collection/${collectionId}`;
};

// Helper function to format the API response
export const formatCollectionResponse = (response: CollectionResponse) => {
  const { collection } = response;
  const text = `# Collection: ${collection.info.name}

## Collection Information
Created: ${collection.info.createdAt}
Updated: ${collection.info.updatedAt}
Last Updated By: ${collection.info.lastUpdatedBy}
ID: ${collection.info.uid}
Postman View URL: ${getPostmanViewUrl(collection.info.uid)}

## Description
${collection.info.description || 'No description provided'}

## Top-Level Folders
${collection.item ? formatRootLevelFolders(collection.item) : 'No folders in collection'}

## Folders and Requests
${collection.item ? formatCollectionItems(collection.item) : 'No items in collection'}`;

  return [{
    type: "text",
    text: text
  }];
};

// Main function to execute the API call
export const fetchPostmanCollection = async ({
  collectionId,
  access_key,
  model,
}: FunctionParams): Promise<CollectionResponse> => {
  const baseUrl = process.env.POSTMAN_BASE_URL || 'https://api.getpostman.com';
  const apiKey = process.env.POSTMAN_API_KEY || '';

  try {
    // Construct the URL with query parameters
    const url = new URL(`${baseUrl}/collections/${collectionId}`);
    if (access_key) {
      url.searchParams.append('access_key', access_key);
    }
    if (model) {
      url.searchParams.append('model', model);
    }

    // Set up headers for the request
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
      'Accept': 'application/json',
    };

    // Perform the fetch request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    // Check if the response was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }

    // Parse and return the response data
    const data: CollectionResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching collection:', error);
    throw new Error('An error occurred while fetching the collection.');
  }
};

// Tool definition for Anthropic
export const postmanCollectionTool = {
  function: fetchPostmanCollection,
  definition: {
    name: 'get_collection',
    description: 'Get information about a Postman collection.',
    input_schema: {
      type: 'object',
      properties: {
        collectionId: {
          type: 'string',
          description: 'The ID of the collection to retrieve.'
        },
        access_key: {
          type: 'string',
          description: 'A collection\'s read-only access key (optional).'
        },
        model: {
          type: 'string',
          enum: ['minimal'],
          description: 'Return a minimal representation of the collection (optional).'
        }
      },
      required: ['collectionId'],
      additionalProperties: false
    }
  }
};