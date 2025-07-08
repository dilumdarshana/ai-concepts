export function handleError(
  error: unknown,
  operation: string,
  collectionName?: string,
) {
  let message = 'Unknown error occurred';
  let details: any = undefined;

  if (error instanceof Error) {
    message = error.message;
    details = {
      name: error.name,
      stack: error.stack,
    };
  } else if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object' && error !== null) {
    message = (error as any).message || message;
    details = error;
  }

  // Log error to stderr (optional)
  console.error(`[Error in ${operation}]`, {
    collection: collectionName,
    message,
    details,
  });

  return {
    error: {
      operation,
      collection: collectionName || null,
      message,
      details,
    },
  };
}
