/**
 * Supported JDK distributions.
 *
 * @since 1.2.0
 */
const JdkDistribution = {
    /**
     * Amazon Corretto
     * @see https://aws.amazon.com/corretto/
     * @since 1.2.0
     */
    CORRETTO: 'CORRETTO',
    /**
     * Eclipse Temurin
     * @see https://projects.eclipse.org/projects/adoptium.temurin
     * @since 1.2.0
     */
    TEMURIN: 'TEMURIN'
}

module.exports = { JdkDistribution }
