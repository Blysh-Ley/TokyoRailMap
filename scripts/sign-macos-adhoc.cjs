const { signAsync } = require('@electron/osx-sign');

module.exports = async function signMacAdhoc(configuration) {
    const defaultOptionsForFile = configuration.optionsForFile;

    await signAsync({
        ...configuration,
        identity: '-',
        identityValidation: false,
        optionsForFile(filePath) {
            const options = defaultOptionsForFile ? defaultOptionsForFile(filePath) : {};
            return {
                ...options,
                timestamp: 'none'
            };
        }
    });
};
