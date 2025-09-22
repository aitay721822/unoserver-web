using System.Net.Http.Headers;
using Unoserver.SDK.Models;

namespace Unoserver.SDK;

/// <summary>
/// A builder for creating and executing a file conversion request.
/// </summary>
public class ConversionBuilder
{
    private readonly UnoserverClient _client;
    private Stream? _fileStream;
    private string? _fileName;
    private ConversionFormat? _targetFormat;
    private string? _filter;

    internal ConversionBuilder(UnoserverClient client)
    {
        _client = client;
    }

    /// <summary>
    /// Sets the file to be converted.
    /// </summary>
    /// <param name="stream">The stream containing the file content.</param>
    /// <param name="fileName">The name of the file.</param>
    /// <returns>The <see cref="ConversionBuilder"/> instance.</returns>
    public ConversionBuilder WithFile(Stream stream, string fileName)
    {
        _fileStream = stream;
        _fileName = fileName;
        return this;
    }

    /// <summary>
    /// Sets the target format for the conversion.
    /// </summary>
    /// <param name="format">The target conversion format.</param>
    /// <returns>The <see cref="ConversionBuilder"/> instance.</returns>
    public ConversionBuilder ToFormat(ConversionFormat format)
    {
        _targetFormat = format;
        return this;
    }

    /// <summary>
    /// Sets an optional conversion filter.
    /// </summary>
    /// <param name="filter">The name of the filter to use.</param>
    /// <returns>The <see cref="ConversionBuilder"/> instance.</returns>
    public ConversionBuilder WithFilter(string? filter)
    {
        _filter = filter;
        return this;
    }

    /// <summary>
    /// Executes the conversion request.
    /// </summary>
    /// <param name="cancellationToken">A cancellation token to cancel the request.</param>
    /// <returns>A stream containing the converted file.</returns>
    /// <exception cref="InvalidOperationException">Thrown when the file or target format is not set.</exception>
    public async Task<Stream> ExecuteAsync(CancellationToken cancellationToken = default)
    {
        if (_fileStream == null || string.IsNullOrEmpty(_fileName))
        {
            throw new InvalidOperationException("File must be provided using WithFile().");
        }

        if (_targetFormat == null)
        {
            throw new InvalidOperationException("Target format must be set using ToFormat().");
        }

        var format = _targetFormat?.ToString().ToLower();
        var requestUri = $"/convert/{format}";
        if (!string.IsNullOrEmpty(_filter))
        {
            requestUri += $"?filter={_filter}";
        }

        using var content = new MultipartFormDataContent();
        using var streamContent = new StreamContent(_fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(streamContent, "file", _fileName);

        return await _client.PostAsync(requestUri, content, cancellationToken);
    }
}
