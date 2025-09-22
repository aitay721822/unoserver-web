
using System.Net;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Moq;
using Moq.Protected;
using Unoserver.SDK.Exceptions;
using Unoserver.SDK.Models;

namespace Unoserver.SDK.Tests;

public class UnoserverClientTests
{
    private readonly Mock<HttpMessageHandler> _mockHandler;
    private readonly UnoserverClient _client;
    private readonly Uri _baseAddress = new("http://localhost:3000");

    public UnoserverClientTests()
    {
        _mockHandler = new Mock<HttpMessageHandler>();
        var httpClient = new HttpClient(_mockHandler.Object) { BaseAddress = _baseAddress };
        _client = new UnoserverClient(httpClient);
    }

    [Fact]
    public async Task GetQueueStatusAsync_ShouldReturnQueueStatus_WhenApiReturnsSuccess()
    {
        // Arrange
        var expectedStatus = new QueueStatus(0, 0, false, 8, new List<WorkerStatus>
        {
            new(1, 12345, false, false, 0)
        });
        var jsonResponse = JsonSerializer.Serialize(expectedStatus);
        var responseMessage = new HttpResponseMessage
        {
            StatusCode = HttpStatusCode.OK,
            Content = new StringContent(jsonResponse, Encoding.UTF8, "application/json")
        };

        _mockHandler
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Get && req.RequestUri!.PathAndQuery == "/queue/status"),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(responseMessage);

        // Act
        var result = await _client.GetQueueStatusAsync();

        // Assert
        result.Should().NotBeNull();
        result.Should().BeEquivalentTo(expectedStatus, options => options.ComparingByMembers<QueueStatus>());
    }

    [Fact]
    public async Task GetQueueStatusAsync_ShouldThrowUnoserverException_WhenApiReturnsError()
    {
        // Arrange
        var responseMessage = new HttpResponseMessage
        {
            StatusCode = HttpStatusCode.InternalServerError,
            Content = new StringContent("Server Error")
        };

        _mockHandler
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(responseMessage);

        // Act
        Func<Task> act = async () => await _client.GetQueueStatusAsync();

        // Assert
        var exceptionAssertion = await act.Should().ThrowAsync<UnoserverException>();
        exceptionAssertion.WithInnerException<HttpRequestException>();
    }

    [Fact]
    public async Task Convert_ExecuteAsync_ShouldReturnStream_WhenConversionIsSuccessful()
    {
        // Arrange
        var responseStream = new MemoryStream("converted-file-content"u8.ToArray());
        var responseMessage = new HttpResponseMessage
        {
            StatusCode = HttpStatusCode.OK,
            Content = new StreamContent(responseStream)
        };

        _mockHandler
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Post && req.RequestUri!.PathAndQuery.StartsWith("/convert/pdf")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(responseMessage);

        using var sourceStream = new MemoryStream("source-file-content"u8.ToArray());

        // Act
        var resultStream = await _client.Convert()
            .WithFile(sourceStream, "test.txt")
            .ToFormat(ConversionFormat.Pdf)
            .ExecuteAsync();

        // Assert
        resultStream.Should().NotBeNull();
        using var reader = new StreamReader(resultStream);
        var content = await reader.ReadToEndAsync();
        content.Should().Be("converted-file-content");
    }

    [Fact]
    public async Task Convert_ExecuteAsync_ShouldThrowInvalidOperationException_WhenFileIsNotSet()
    {
        // Act
        var conversion = _client.Convert().ToFormat(ConversionFormat.Docx);
        Func<Task> act = async () => await conversion.ExecuteAsync();

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("File must be provided using WithFile().");
    }

    [Fact]
    public async Task Convert_ExecuteAsync_ShouldThrowInvalidOperationException_WhenFormatIsNotSet()
    {
        // Arrange
        using var sourceStream = new MemoryStream();
        
        // Act
        var conversion = _client.Convert().WithFile(sourceStream, "test.txt");
        Func<Task> act = async () => await conversion.ExecuteAsync();

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("Target format must be set using ToFormat().");
    }
    
    [Fact]
    public async Task Convert_ExecuteAsync_ShouldIncludeFilterQuery_WhenFilterIsProvided()
    {
        // Arrange
        var responseMessage = new HttpResponseMessage { StatusCode = HttpStatusCode.OK, Content = new StreamContent(new MemoryStream()) };
        const string filterName = "writer_pdf_Export";

        _mockHandler
            .Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.Is<HttpRequestMessage>(req => req.RequestUri!.PathAndQuery.EndsWith($"?filter={filterName}")),
                ItExpr.IsAny<CancellationToken>()
            )
            .ReturnsAsync(responseMessage)
            .Verifiable();

        using var sourceStream = new MemoryStream();

        // Act
        await _client.Convert()
            .WithFile(sourceStream, "test.docx")
            .ToFormat(ConversionFormat.Pdf)
            .WithFilter(filterName)
            .ExecuteAsync();

        // Assert
        _mockHandler.Protected().Verify(
            "SendAsync",
            Times.Once(),
            ItExpr.Is<HttpRequestMessage>(req => req.Method == HttpMethod.Post && req.RequestUri!.PathAndQuery == $"/convert/pdf?filter={filterName}"),
            ItExpr.IsAny<CancellationToken>()
        );
    }
}
