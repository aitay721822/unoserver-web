using Microsoft.Extensions.DependencyInjection;
using Polly;
using Polly.Extensions.Http;
using Polly.Retry;

namespace Unoserver.SDK;

/// <summary>
/// Extension methods for setting up Unoserver client in an <see cref="IServiceCollection" />.
/// </summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Adds the <see cref="UnoserverClient"/> to the specified <see cref="IServiceCollection"/>.
    /// </summary>
    /// <param name="services">The <see cref="IServiceCollection"/> to add the client to.</param>
    /// <param name="configureClient">An action to configure the <see cref="HttpClient"/>.</param>
    /// <param name="retryCount">The number of retries to attempt on transient failures.</param>
    /// <returns>The <see cref="IHttpClientBuilder"/>.</returns>
    public static IHttpClientBuilder AddUnoserverClient(
        this IServiceCollection services, 
        Action<HttpClient> configureClient,
        int retryCount = 3)
    {
        return services.AddHttpClient<UnoserverClient>(configureClient)
            .AddPolicyHandler(GetRetryPolicy(retryCount));
    }

    private static AsyncRetryPolicy<HttpResponseMessage> GetRetryPolicy(int retryCount)
    {
        return HttpPolicyExtensions
            .HandleTransientHttpError()
            .OrResult(msg => msg.StatusCode == System.Net.HttpStatusCode.NotFound)
            .WaitAndRetryAsync(retryCount, retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));
    }
}
