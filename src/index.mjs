export function isImageGenerationRequest(body) {
   // Handle null or undefined body
   if (!body) {
     return false;
   }

   // Check for explicit image generation parameters
   if (body.prompt && (!body.messages || body.messages.length === 0)) {
     // Validate image-specific parameters if present
     const hasInvalidImageParams =
       (body.n !== undefined && (typeof body.n !== 'number' || body.n <= 0)) ||
       (body.size && !/^\d+x\d+$/.test(body.size)) ||
       (body.response_format && !['b64_json', 'url'].includes(body.response_format));

     if (hasInvalidImageParams) {
       return false;
     }

     return true;
   }

   // Check for image-specific parameters with model
   const hasImageParams =
     (body.n !== undefined && typeof body.n === 'number' && body.n > 0) ||
     (body.size && /^\d+x\d+$/.test(body.size)) ||
     (body.response_format && ['b64_json', 'url'].includes(body.response_format));

   if (hasImageParams && body.model) {
     const modelId = String(body.model).toLowerCase();
     const imageModelPatterns = [
       'dall-e', 'stable-diffusion', 'midjourney', 'flux',
       'imagen', 'sdxl', 'sd-xl', 'playground'
     ];
     if (imageModelPatterns.some(pattern => modelId.includes(pattern))) {
       return true;
     }
   }

   // Check messages for image generation intent
   if (Array.isArray(body.messages) && body.messages.length > 0) {
     const lastUserMessage = body.messages
       .filter(m => m.role === 'user')
       .pop();

     if (lastUserMessage && lastUserMessage.content) {
       const content = typeof lastUserMessage.content === 'string'
         ? lastUserMessage.content
         : JSON.stringify(lastUserMessage.content);

       const imageGenerationKeywords = [
         'generate image', 'create image', 'draw', 'paint',
         'make a picture', 'create a picture', 'generate picture',
         'text to image', 'image from text', 'create artwork',
         'generate artwork', 'make an image'
       ];

       return imageGenerationKeywords.some(keyword =>
         content.toLowerCase().includes(keyword));
     }
   }

   return false;
 }

/**
 * Converts an image generation response to chat completion format
 * @param {Object} imageGenResponse - OpenAI image generation response
 * @returns {Object} Chat completion format response
 */
export function convertImageGenerationToChatCompletion(imageGenResponse) {
  // Check for missing or empty data array
  if (!imageGenResponse || !imageGenResponse.data || !Array.isArray(imageGenResponse.data) || imageGenResponse.data.length === 0) {
    // Fallback to basic structure if conversion fails
    return {
      id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'image-generation',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: '[Image generated successfully]'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }

  // We know we have at least one element in the data array
  // Extract the first image URL or base64 data
  const firstImage = imageGenResponse.data[0];
  let imageContent = '';

  if (firstImage && firstImage.url) {
    imageContent = firstImage.url;
  } else if (firstImage && firstImage.b64_json) {
    imageContent = `data:image/png;base64,${firstImage.b64_json}`;
  } else {
    imageContent = '[Image generated]';
  }

  return {
    id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: imageGenResponse.model || 'image-generation',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: imageContent
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: imageGenResponse.usage?.prompt_tokens || 0,
      completion_tokens: imageGenResponse.usage?.completion_tokens || 0,
      total_tokens: imageGenResponse.usage?.total_tokens || 0
    }
  };
}
