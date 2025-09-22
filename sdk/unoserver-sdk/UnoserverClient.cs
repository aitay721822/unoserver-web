using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Unoserver.SDK.Exceptions;
using Unoserver.SDK.Models;

namespace Unoserver.SDK;

/// <summary>
/// A client for interacting with the Unoserver API.
/// </summary>
public class UnoserverClient
{
    private readonly HttpClient _httpClient;
    private static readonly JsonSerializerOptions SerializerOptions = new() 
    {
         PropertyNameCaseInsensitive = true, 
         DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    /// <summary>
    /// Initializes a new instance of the <see cref="UnoserverClient"/> class.
    /// </summary>
    /// <param name="httpClient">The HttpClient to use for requests.</param>
    public UnoserverClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    /// <summary>
    /// Gets the status of the conversion queue.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token to cancel the request.</param>
    /// <returns>The <see cref="QueueStatus"/>.</returns>
    /// <exception cref="UnoserverException">Thrown when the API returns an error.</exception>
    public async Task<QueueStatus?> GetQueueStatusAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await _httpClient.GetAsync("/queue/status", cancellationToken);
            response.EnsureSuccessStatusCode();
            var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonSerializer.DeserializeAsync<QueueStatus>(contentStream, SerializerOptions, cancellationToken);
        }
        catch (HttpRequestException e)
        {
            throw new UnoserverException("Failed to get queue status.", e);
        }
    }

    /// <summary>
    /// Starts a file conversion operation.
    /// </summary>
    /// <returns>A <see cref="ConversionBuilder"/> to configure the conversion.</returns>
    public ConversionBuilder Convert()
    {
        return new ConversionBuilder(this);
    }

    internal async Task<Stream> PostAsync(string requestUri, HttpContent content, CancellationToken cancellationToken)
    {
        try
        {
            var response = await _httpClient.PostAsync(requestUri, content, cancellationToken);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadAsStreamAsync(cancellationToken);
        }
        catch (HttpRequestException e)
        {
            throw new UnoserverException("Conversion failed.", e);
        }
    }
}
