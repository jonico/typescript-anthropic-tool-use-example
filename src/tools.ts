import Anthropic from "@anthropic-ai/sdk";
import { Buffer } from 'buffer';
import process from 'process';
import { z } from 'zod';

import {
  postmanPrivateNetworkTool,
  getAllElementsAndFoldersZodSchema,
  fetchPrivateAPINetworkElements,
  formatPrivateApiResponse
} from './private-api-network';
import {
  postmanCollectionTool,
  getCollectionZodSchema,
  fetchPostmanCollection,
  formatCollectionResponse
} from './postman-collection';
import {
  postmanToolgenTool,
  generateToolZodSchema,
  generate_tool_from_postman_request,
  GenerateToolParams,
} from './postman-toolgen';
import {
  postmanNetworkSearchTool,
  searchNetworkZodSchema,
  search_postman_network,
} from './postman-network-search';
import { postmanEntitiesByTagTool, getElementsByTag, getElementsByTagZodSchema } from './postman-entities-by-tag';

type CreateSongParams = {
  prompt: string;
  tags?: string;
  title: string;
  make_instrumental?: boolean;
  wait_audio?: boolean;
};

type SongResponseItem = {
  id: string;
  title: string;
  image_url: string;
  lyric: string;
  audio_url: string;
  video_url: string;
  created_at: string;
  model_name: string;
  status: string;
  gpt_description_prompt: string | null;
  prompt: string;
  type: string;
  tags: string;
};

type CreateSongResponse = SongResponseItem[];

const createSongWithSunoAI = async ({
  prompt,
  tags,
  title,
  make_instrumental = false,
  wait_audio = true,
}: CreateSongParams): Promise<CreateSongResponse> => {
  const sunoAIUrl = 'http://localhost:3000/api/custom_generate';

  try {
    const response = await fetch(sunoAIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        tags,
        title,
        make_instrumental,
        wait_audio,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }

    const data: CreateSongResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating song:', error);
    throw new Error('An error occurred while creating the song.');
  }
};

type AcedataCreateSongParams = {
  lyric: string;
  style: string;
  title: string;
  action?: 'generate';
  model?: string;
  custom?: boolean;
  instrumental?: boolean;
};

type AcedataSongResponse = {
  id: string;
  title: string;
  image_url: string;
  lyric: string;
  audio_url: string;
  video_url: string;
  created_at: string;
  model: string;
  state: string;
  style: string;
  duration: number;
};

type AcedataApiResponse = {
  success: boolean;
  task_id: string;
  trace_id: string;
  data: AcedataSongResponse[];
};

const createSongWithAcedata = async ({
  lyric,
  style,
  title,
  action = 'generate',
  model = 'chirp-v3-0',
  custom = true,
  instrumental = false,
}: AcedataCreateSongParams): Promise<AcedataApiResponse> => {
  const url = 'https://api.acedata.cloud/suno/audios';
  const token = `${process.env.ACEDATA_API_KEY}`;

  const body = JSON.stringify({
    action,
    model,
    lyric,
    custom,
    instrumental,
    style,
    title,
  });

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }

    const data: AcedataApiResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating song:', error);
    throw new Error('An error occurred while creating the song.');
  }
};

type ContentType = 'page';

type ExpandOptions =
  | 'childTypes.all'
  | 'body'
  | 'body.storage'
  | 'childTypes.attachment'
  | 'childTypes.comment'
  | 'childTypes.page'
  | 'container'
  | 'metadata.currentuser'
  | 'metadata.properties'
  | 'metadata.labels'
  | 'operations'
  | 'children.page'
  | 'children.attachment'
  | 'children.comment'
  | 'restrictions.read.restrictions.user'
  | 'restrictions.read.restrictions.group'
  | 'restrictions.update.restrictions.user'
  | 'restrictions.update.restrictions.group'
  | 'history'
  | 'version'
  | 'descendants.page'
  | 'descendants.attachment'
  | 'descendants.comment'
  | 'space';

type GetContentParams = {
  type: ContentType;
  title: string;
  expand: ExpandOptions[];
};

const getConfluenceContent = async ({ type, title, expand }: GetContentParams) => {
  const baseUrl = `${process.env.CONFLUENCE_BASE_URL}/wiki/rest`;
  const url = new URL(`${baseUrl}/api/content`);

  url.searchParams.append('type', type);
  url.searchParams.append('title', title);
  // Handle expand parameter - ensure it's an array and join with commas
  if (expand && Array.isArray(expand)) {
    url.searchParams.append('expand', expand.join(','));
  } else {
    // Default to include body.storage if no expand is provided
    url.searchParams.append('expand', 'body.storage');
  }

  // Create basic auth token
  const auth = Buffer.from(
    `${process.env.CONFLUENCE_USERNAME}:${process.env.CONFLUENCE_API_KEY}`
  ).toString('base64');

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching Confluence content:', error);
    throw new Error('An error occurred while fetching Confluence content');
  }
};

type ImageGenerationParams = {
  prompt: string;
  n?: number;
  size?: '256x256' | '512x512' | '1024x1024';
  model?: 'dall-e-3' | 'dall-e-2' | 'gpt-image-1';
  quality?: 'standard' | 'hd' | 'low';
  response_format?: 'url' | 'b64_json';
};

type ImageData = {
  revised_prompt: string;
  url: string;
};

type ImageGenerationResponse = {
  created: number;
  data: ImageData[];
};

// Add this near the top of the file after the imports
const zodSchemas = {
  get_weather: {
    location: z.string().describe("The location to get the weather for")
  },

  create_song_with_suno_ai_classic: {
    prompt: z.string().describe("The lyrics for the song, do not include instructions what the lyrics should be, just the lyrics themselves"),
    tags: z.string().optional().describe("genre with the song"),
    title: z.string().describe("The title of the song"),
    make_instrumental: z.boolean().optional().describe("Whether to create an instrumental version of the song"),
    wait_audio: z.boolean().optional().describe("Whether to wait for the audio to be generated")
  },

  create_song_suno_ai_ace: {
    musicText: z.string().describe("The lyrics for the song, do not include instructions what the lyrics should be, just the lyrics themselves"),
    musicStyle: z.string().describe("The style of the music (e.g., \"rock\", \"pop\", \"jazz\").")
  },

  get_confluence_content: {
    type: z.enum(["page"]).describe("The type of content to retrieve"),
    title: z.string().describe("The title of the content to retrieve"),
    expand: z.array(
      z.enum([
        "body",
        "body.storage",
        "childTypes.all",
        "childTypes.attachment",
        "childTypes.comment",
        "childTypes.page",
        "container",
        "metadata.currentuser",
        "metadata.properties",
        "metadata.labels",
        "operations",
        "children.page",
        "children.attachment",
        "children.comment",
        "restrictions.read.restrictions.user",
        "restrictions.read.restrictions.group",
        "restrictions.update.restrictions.user",
        "restrictions.update.restrictions.group",
        "history",
        "version",
        "descendants.page",
        "descendants.attachment",
        "descendants.comment",
        "space"
      ])
    ).optional().describe("Properties to expand in the response, body.storage is required to get the content")
  },

  generate_image: {
    prompt: z.string().describe("The description of the image to generate"),
    n: z.number().int().min(1).max(10).optional().describe("The number of images to generate. Defaults to 1. dalle-3 only supports 1."),
    size: z.enum(["256x256", "512x512", "1024x1024"]).optional().describe("The size of the generated image. Larger sizes produce more detailed images. Defaults to 1024x1024. dall-e-3 only supports 1024x1024."),
    model: z.enum(["dall-e-3", "dall-e-2", "gpt-image-1"]).optional().describe("The model to use for image generation."),
    quality: z.enum(["standard", "hd", "low"]).optional().describe("The quality of the generated image."),
    response_format: z.enum(["url", "b64_json"]).optional().describe("The response format of the generated image.")
  },

  get_entities_by_query: {
    filter: z.string().describe("Filter for just the entities defined by this filter, e.g. metadata.tags=foo for tag foo in Backstage or metadata.name=<uid retrieved> to get details about a specific element"),
    //fields: z.string().optional().describe("Restrict to just these fields in the response."),
    limit: z.number().int().optional().describe("Number of APIs to return in the response."),
    orderField: z.string().optional().describe("The fields to sort returned results by."),
    cursor: z.string().optional().describe("Cursor to a set page of results.")
  },

  get_all_elements_and_folders: getAllElementsAndFoldersZodSchema,
  get_collection: getCollectionZodSchema,
  generate_tool: generateToolZodSchema,
  search_postman_network: searchNetworkZodSchema,
  get_elements_by_tag: getElementsByTagZodSchema
};

// Add a utility function for truncating strings
const truncateString = (str: string, maxLength?: number) => {
  const limit = maxLength || Number(process.env.TRUNCATION_LIMIT) || 19000;
  if (str.length <= limit) return str;
  return str.slice(0, limit - 3) + '...';
};

const generateImage = async ({
  prompt,
  n,
  size,
  model,
  quality,
  response_format,
  style,
  output_format,
  output_compression,
  moderation,
  background,
  user
}: {
  prompt: string;
  n?: number;
  size?: string;
  model?: 'dall-e-3' | 'dall-e-2' | 'gpt-image-1';
  quality?: string;
  response_format?: 'url' | 'b64_json';
  style?: 'vivid' | 'natural';
  output_format?: 'png' | 'jpeg' | 'webp';
  output_compression?: number;
  moderation?: 'auto' | 'low';
  background?: 'auto' | 'transparent' | 'opaque';
  user?: string;
}) => {
  const baseUrl = 'https://api.openai.com/v1';
  try {
    // Model selection and allowed params
    let usedModel = model;
    if (!usedModel) {
      // If any gpt-image-1 specific param is set, use gpt-image-1, else default to dall-e-3
      if (output_format || output_compression || moderation || background) {
        usedModel = 'gpt-image-1';
      } else {
        usedModel = 'dall-e-3';
      }
    }
    let body: any = { prompt, model: usedModel };
    if (usedModel === 'dall-e-2') {
      body.n = n ?? 1;
      body.size = size && ['256x256', '512x512', '1024x1024'].includes(size) ? size : '1024x1024';
      body.quality = 'standard';
      body.response_format = response_format || 'url';
    } else if (usedModel === 'dall-e-3') {
      body.n = 1; // only n=1 supported
      body.size = size && ['1024x1024', '1792x1024', '1024x1792'].includes(size) ? size : '1024x1024';
      if (quality && ['standard', 'hd'].includes(quality)) body.quality = quality;
      else body.quality = 'standard';
      body.response_format = response_format || 'url';
      if (style && ['vivid', 'natural'].includes(style)) body.style = style;
    } else if (usedModel === 'gpt-image-1') {
      if (n) body.n = Math.max(1, Math.min(10, n));
      body.size = size && ['auto', '1024x1024', '1536x1024', '1024x1536'].includes(size) ? size : 'auto';
      // Default to 'low' quality for gpt-image-1 if not specified
      if (quality && ['auto', 'high', 'medium', 'low'].includes(quality)) body.quality = quality;
      else body.quality = 'low';
      if (output_format && ['png', 'jpeg', 'webp'].includes(output_format)) body.output_format = output_format;
      if ((output_format === 'jpeg' || output_format === 'webp') && typeof output_compression === 'number') body.output_compression = output_compression;
      if (moderation && ['auto', 'low'].includes(moderation)) body.moderation = moderation;
      if (background && ['auto', 'transparent', 'opaque'].includes(background)) body.background = background;
      // gpt-image-1 does not support response_format
    }
    if (user) body.user = user;
    // Remove undefined values
    Object.keys(body).forEach(key => body[key] === undefined && delete body[key]);
    // Log the actual API call details (without API key)
    console.log('[generateImage] Calling OpenAI image API with:', {
      url: `${baseUrl}/images/generations`,
      body
    });
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }
    return await response.json();
  } catch (error) {
    console.error('Error generating image:', error);
    throw new Error('An error occurred while generating the image.');
  }
};

// Backstage Catalog Tool

// Define types for Backstage Catalog

type EntityMetadata = {
  namespace: string;
  annotations: Record<string, string>;
  name: string;
  title: string;
  description: string;
  tags: string[];
  uid: string;
  etag: string;
};

type EntitySpec = {
  type: string;
  lifecycle: string;
  owner: string;
  definition: string;
  system: string;
};

type EntityRelation = {
  type: string;
  targetRef: string;
};

type Entity = {
  metadata: EntityMetadata;
  apiVersion: string;
  kind: string;
  spec: EntitySpec;
  relations: EntityRelation[];
};

type PageInfo = {
  nextCursor?: string;
  prevCursor?: string;
};

type GetEntitiesByQueryResponse = {
  items: (Entity)[];
  totalItems: number | string;
  pageInfo: PageInfo;
};

type functionParams = {
  filter: string;
  fields?: string;
  limit?: number;
  orderField?: string;
  cursor?: string;
};

const getEntitiesByQuery = async ({ filter, fields, limit, orderField, cursor }: functionParams): Promise<GetEntitiesByQueryResponse> => {
  const baseUrl = process.env.BACKSTAGE_BASE_URL || '/'; // Base URL will be provided by the user
  const url = new URL(`${baseUrl}/entities/by-query`);

  // Construct query parameters
  const params = new URLSearchParams();
  // log out the filter
  console.log('filter:', filter);
  // if filter is not in the form metadata.tags=foo, add metadata.tags=
  if (!filter.includes('=')) {
    params.append('filter', `metadata.tags=${filter}`);
  } else {
    params.append('filter', filter);
  }
  if (fields) params.append('fields', fields);
  // if limit is not set, set it to 100
  if (!limit) limit = 100;
  params.append('limit', limit.toString());
  if (orderField) params.append('orderField', orderField);
  if (cursor) params.append('cursor', cursor);

  // Perform the fetch request
  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  // Check if the response was successful
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(JSON.stringify(errorData));
  }

  // Parse and return the response data
  const data: GetEntitiesByQueryResponse = await response.json();
  return data;
};

const backstageTool = {
  function: getEntitiesByQuery,
  definition: {
    name: 'get_entities_by_query',
    description: 'Search for Backstage API entities by a given query.',
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: 'string',
          description: 'Filter for just the entities defined by this filter, e.g. metadata.tags=foo for tag foo in Postman and Backstage'
        },
        fields: {
          type: 'string',
          description: 'Restrict to just these fields in the response.'
        },
        limit: {
          type: 'integer',
          description: 'Number of APIs to return in the response.'
        },
        orderField: {
          type: 'string',
          description: 'The fields to sort returned results by.'
        },
        cursor: {
          type: 'string',
          description: 'Cursor to a set page of results.'
        }
      },
      required: ['filter'],
      additionalProperties: false
    }
  }
};

const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "Get the weather for a given location",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The location to get the weather for",
        },
      },
    },
  },
  {
    name: "create_song_with_suno_ai_classic",
    description: "Creates a song using Suno AI classic API, does not currently support instant video generation",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The lyrics for the song, do not include instructions what the lyrics should be, just the lyrics themselves"
        },
        tags: {
          type: "string",
          description: "genre with the song."
        },
        title: {
          type: "string",
          description: "The title of the song."
        },
        make_instrumental: {
          type: "boolean",
          description: "Whether to create an instrumental version of the song."
        },
        wait_audio: {
          type: "boolean",
          description: "Whether to wait for the audio to be generated."
        }
      },
      required: ['prompt', 'title'],
      additionalProperties: false
    }
  },
  {
    name: 'create_song_suno_ai_ace',
    description: 'Create a song using Suno ACE API, supports music videos as well',
    input_schema: {
      type: 'object',
      properties: {
        musicText: {
          type: 'string',
          description: 'The lyrics for the song, do not include instructions what the lyrics should be, just the lyrics themselves'
        },
        musicStyle: {
          type: 'string',
          description: 'The style of the music (e.g., "rock", "pop", "jazz").'
        }
      },
      required: ['musicText', 'musicStyle'],
      additionalProperties: false
    }
  },
  {
    name: "get_confluence_content",
    description: "Retrieves content from Confluence",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["page"],
          description: "The type of content to retrieve"
        },
        title: {
          type: "string",
          description: "The title of the content to retrieve"
        },
        expand: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "body",
              "body.storage",
              "childTypes.all",
              "childTypes.attachment",
              "childTypes.comment",
              "childTypes.page",
              "container",
              "metadata.currentuser",
              "metadata.properties",
              "metadata.labels",
              "operations",
              "children.page",
              "children.attachment",
              "children.comment",
              "restrictions.read.restrictions.user",
              "restrictions.read.restrictions.group",
              "restrictions.update.restrictions.user",
              "restrictions.update.restrictions.group",
              "history",
              "version",
              "descendants.page",
              "descendants.attachment",
              "descendants.comment",
              "space"
            ]
          },
          description: "Properties to expand in the response, body.storage is required to get the content"
        }
      },
      required: ["type", "title"],
      additionalProperties: false
    }
  },
  {
    name: "generate_image",
    description: "Generate an image using OpenAI's DALL-E or GPT Image models",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The description of the image to generate"
        },
        n: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "The number of images to generate. Defaults to 1. dalle-3 only supports 1."
        },
        size: {
          type: "string",
          enum: ["256x256", "512x512", "1024x1024"],
          description: "The size of the generated image. Larger sizes produce more detailed images. Defaults to 1024x1024. dall-e-3 only supports 1024x1024."
        },
        model: {
          type: "string",
          enum: ["dall-e-3", "dall-e-2", "gpt-image-1"],
          description: "The model to use for image generation."
        },
        quality: {
          type: "string",
          enum: ["standard", "hd", "low"],
          description: "The quality of the generated image."
        },
        response_format: {
          type: "string",
          enum: ["url", "b64_json"],
          description: "The response format of the generated image."
        }
      },
      required: ["prompt"],
      additionalProperties: false
    }
  },
  backstageTool.definition,
  postmanPrivateNetworkTool.definition,
  postmanCollectionTool.definition,
  postmanToolgenTool.definition,
  postmanNetworkSearchTool.definition,
  postmanEntitiesByTagTool.definition,
];

const functions = {
  get_weather: async (input: { location: string }) => {
    try {
      const apiKey = process.env.WEATHER_API_KEY;
      if (!apiKey) {
        console.error("[WEATHER] Error: No API key found in environment variables");
        throw new Error("Weather API key not found");
      }

      const response = await fetch(
        `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${input.location}&aqi=no`
      );

      if (!response.ok) {
        console.error(`[WEATHER] API error: ${response.status} ${response.statusText}`);
        throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const result = `The current weather in ${data.location.name} is ${data.current.condition.text} with a temperature of ${data.current.temp_c}°C (${data.current.temp_f}°F).`;
      // return result wrapped like in the other functions
      return [{
        type: "text",
        text: result
      }];
    } catch (error) {
      console.error(`[WEATHER] Error fetching weather: ${error}`);
      throw error;
    }
  },
  create_song_with_suno_ai_classic: async (input: CreateSongParams) => {
    try {
      const response = await createSongWithSunoAI(input);
      console.log('-------- Suno AI response:', response);

      return response.map((song) => ({
        type: "text",
        text: `Generated song "${song.title}":
Lyrics:
${song.lyric}

Audio URL: ${song.audio_url}
Video URL: ${song.video_url}`
      }));

    } catch (err) {
      console.error('Error creating song with Suno AI:', err);
      return [{
        type: "text",
        text: 'Error creating song with Suno AI'
      }];
    }
  },
  create_song_suno_ai_ace: async (input: { musicText: string, musicStyle: string }) => {
    try {
      const response = await createSongWithAcedata({
        lyric: input.musicText,
        style: input.musicStyle,
        title: `Generated Song`,
      });
      console.log('-------- ACE Data response:', response);

      if (response.success && response.data.length > 0) {
        return response.data.map(song => ({
          type: "text",
          text: `Generated song "${song.title}":
Lyrics:
${song.lyric}

Style: ${song.style}
Audio URL: ${song.audio_url}
Video URL: ${song.video_url}`
        }));
      }

      return [{
        type: "text",
        text: 'Failed to generate song'
      }];
    } catch (err) {
      console.error('Error creating song with ACE Data:', err);
      return [{
        type: "text",
        text: 'Error creating song with ACE Data'
      }];
    }
  },
  get_confluence_content: async (input: Partial<GetContentParams>) => {
    try {
      const params: GetContentParams = {
        type: input.type || 'page',
        title: input.title || '',
        expand: Array.isArray(input.expand) ? input.expand : ['body.storage']
      };

      const response = await getConfluenceContent(params);
      console.log('-------- Confluence response:', response);

      if (response.results && response.results.length > 0) {
        const content = response.results[0];
        const text = `Title: ${content.title}
ID: ${content.id}
Type: ${content.type}
Status: ${content.status}
${content.body?.storage?.value ? `\nContent:\n${content.body.storage.value}` : ''}`;

        return [{
          type: "text",
          text: truncateString(text)
        }];
      }

      return [{
        type: "text",
        text: 'No content found'
      }];
    } catch (err) {
      console.error('Error getting Confluence content:', err);
      return [{
        type: "text",
        text: `Error getting Confluence content: ${err.message}`
      }];
    }
  },
  generate_image: async (input: ImageGenerationParams) => {
    try {
      const response = await generateImage(input);
      // console.log('-------- DALL-E response:', response);

      if (response.data && response.data.length > 0) {
        return response.data.map(image => {
          // Prefer b64_json if present and requested
          if (image.b64_json) {
            return [
              {
                type: "text",
                text: `Generated image (base64)\nOriginal prompt: ${input.prompt}`
              },
              {
                type: "image",
                data: `${image.b64_json}`,
                mimeType: "image/png", // Assuming PNG, adjust if needed
                alt: `Generated image (base64)\nOriginal prompt: ${input.prompt}`
              }            ];
          } else if (image.url) {
            // Use text type for URLs
            return {
              type: "text",
              text: `Generated image URL: ${image.url}\nOriginal prompt: ${input.prompt}\nRevised prompt: ${image.revised_prompt}`
            };
          } else {
            // Fallback for unexpected response
            return {
              type: "text",
              text: 'Unsupported image type or missing image data.'
            };
          }
        });
      }

      return [{
        type: "text",
        text: 'Failed to generate image'
      }];
    } catch (err) {
      console.error('Error generating image:', err);
      return [{
        type: "text",
        text: `Error generating image: ${err.message}`
      }];
    }
  },
  get_entities_by_query: async (input: functionParams) => {
    try {
      const response = await getEntitiesByQuery(input);
      console.log('-------- Backstage response:', response);

      if (response.items && response.items.length > 0) {
        // If there's only one item, include full details with definition
        if (response.items.length === 1) {
          const entity = response.items[0];
          const text = `Total items found: ${response.totalItems}

Entity title: ${entity.metadata.title}
Entity id: ${entity.metadata.name}
Entity type: ${entity.spec.type}
Entity owner: ${entity.spec.owner}
Entity description: ${entity.metadata.description}
View URL (points to Postman): ${entity.metadata.annotations['backstage.io/view-url']}
Entity definition: ${entity.spec.definition}
Entity namespace: ${entity.metadata.namespace}
Entity uid: ${entity.metadata.uid}
Entity etag: ${entity.metadata.etag}
Entity lifecycle: ${entity.spec.lifecycle}
Entity system: ${entity.spec.system}
Entity relations: ${entity.relations.map(relation => relation.type + ' -> ' + relation.targetRef).join(', ')}
Entity apiVersion: ${entity.apiVersion}
Entity kind: ${entity.kind}
Entity annotations: ${Object.entries(entity.metadata.annotations).map(([key, value]) => `${key}: ${value}`).join(', ')}`;

          return [{
            type: "text",
            text: truncateString(text)
          }];
        }

        // For multiple items, combine all items into one string and truncate
        const text = `Total items found: ${response.totalItems}

${response.items.map(entity =>
          `Entity title: ${entity.metadata.title}
Entity id: ${entity.metadata.name}
Entity type: ${entity.spec.type}
Entity owner: ${entity.spec.owner}
Entity description: ${entity.metadata.description}
View URL (points to Postman): ${entity.metadata.annotations['backstage.io/view-url']}
Entity namespace: ${entity.metadata.namespace}
Entity uid: ${entity.metadata.uid}
Entity lifecycle: ${entity.spec.lifecycle}
Entity system: ${entity.spec.system}
---`).join('\n')}`;

        return [{
          type: "text",
          text: truncateString(text)
        }];
      }

      return [{
        type: "text",
        text: 'No entities found'
      }];
    } catch (err) {
      console.error('Error getting entities by query:', err);
      return [{
        type: "text",
        text: `Error getting entities by query: ${err.message}`
      }];
    }
  },
  get_all_elements_and_folders: async (params) => {
    try {
      const response = await fetchPrivateAPINetworkElements(params);
      return formatPrivateApiResponse(response);
    } catch (err) {
      console.error('Error getting elements and folders:', err);
      return [{
        type: "text",
        text: `Error getting elements and folders: ${err.message}`
      }];
    }
  },
  get_collection: async (params) => {
    try {
      const response = await fetchPostmanCollection(params);
      const fullSpec = JSON.stringify(response, null, 2); // Convert full collection spec to string
      const formattedResponse = formatCollectionResponse(response);

      const text = formattedResponse.map(item => item.text).join('\n\n');
      const fullText = `${text}\n\nFull Collection Spec:\n${fullSpec}`;

      return [{
        type: "text",
        text: truncateString(fullText)
      }];
    } catch (err) {
      console.error('Error getting collection:', err);
      return [{
        type: "text",
        text: `Error getting collection: ${err.message}`
      }];
    }
  },
  generate_tool: async (params: GenerateToolParams) => {
    try {
      const response = await generate_tool_from_postman_request(params);

      if ('data' in response) {
        return [{
          type: "text",
          text: `Generated tool code:\n\n${response.data.text}`
        }];
      } else {
        return [{
          type: "text",
          text: `Error generating tool: ${response.detail}`
        }];
      }
    } catch (err) {
      console.error('Error generating tool:', err);
      return [{
        type: "text",
        text: `Error generating tool: ${err.message}`
      }];
    }
  },
  search_postman_network: async (params) => {
    try {
      const response = await search_postman_network(params);
      if ('data' in response) {
        const text = `Found ${response.meta.total} results:
${response.data.map(result => `
Name: ${result.name}
Method: ${result.method}
URL: ${result.url}
Collection:
  - ID: ${result.collection.id}
  - Go URL: https://go.postman.co/collections/${result.collection.id}
Workspace:
  - ID: ${result.workspace.id}
  - Go URL: https://go.postman.co/workspace/${result.workspace.id}
Publisher: ${result.publisher.name}${result.publisher.isVerified ? ' (Verified)' : ''}
Publisher Type: ${result.publisher.type}
Publisher Profile: ${result.publisher.profilePicUrl}
Links:
  - Web View: ${result.links.web.href}
  - API Endpoint: ${result.links.self.href}
---`).join('\n')}

${response.meta.nextCursor ? `Next Page Cursor: ${response.meta.nextCursor}` : 'No more pages available'}`;

        return [{
          type: "text",
          text: truncateString(text)
        }];
      } else {
        return [{
          type: "text",
          text: `Error searching network: ${response.detail}`
        }];
      }
    } catch (err) {
      console.error('Error searching network:', err);
      return [{
        type: "text",
        text: `Error searching network: ${err.message}`
      }];
    }
  },
  get_elements_by_tag: async (params) => {
    try {
      const response = await getElementsByTag(params);
      if ('data' in response && response.data.entities.length > 0) {
        const text = `Found ${response.data.entities.length} entities for tag '${params.slugId}':\n` +
          response.data.entities.map((e, i) => `#${i + 1}: ${e.entityType} - ${e.entityId}`).join('\n') +
          (response.meta.nextCursor ? `\nNext Cursor: ${response.meta.nextCursor}` : '');
        return [{ type: 'text', text }];
      } else if ('data' in response && response.data.entities.length === 0) {
        return [{ type: 'text', text: 'No entities found for this tag.' }];
      } else if ('detail' in response) {
        return [{ type: 'text', text: `Error fetching entities by tag: ${response.detail}` }];
      } else {
        return [{ type: 'text', text: 'Unknown error fetching entities by tag.' }];
      }
    } catch (err) {
      return [{ type: 'text', text: `Error fetching entities by tag: ${err.message}` }];
    }
  },
};

export { tools, functions, zodSchemas };
