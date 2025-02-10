export const handler = async (
    event: any,
): Promise<string> => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    console.info('Info: Processing event');
    console.debug('Debug: Event details', event);
    console.warn('Warning: This is a sample warning message');
    console.error('Error: This is a sample error message');
    console.assert(false, 'Assert: This is a sample assert message');

    return 'Hello World!';
};