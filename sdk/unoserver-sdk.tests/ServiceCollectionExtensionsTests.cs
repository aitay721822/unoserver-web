using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;

namespace Unoserver.SDK.Tests;

public class ServiceCollectionExtensionsTests
{
    [Fact]
    public void AddUnoserverClient_ShouldRegisterClientAndHttpClient()
    {
        // Arrange
        var services = new ServiceCollection();
        var baseAddress = new Uri("http://test-unoserver:1234");

        // Act
        services.AddUnoserverClient(client =>
        {
            client.BaseAddress = baseAddress;
        });

        var serviceProvider = services.BuildServiceProvider();
        var unoserverClient = serviceProvider.GetService<UnoserverClient>();

        // Assert
        unoserverClient.Should().NotBeNull();
        
        // To test the http client, we would need to resolve it via IHttpClientFactory
        // but for this test, resolving the client is sufficient to prove registration.
        var httpClient = serviceProvider.GetService<IHttpClientFactory>()?.CreateClient(nameof(UnoserverClient));
        httpClient.Should().NotBeNull();
        httpClient!.BaseAddress.Should().Be(baseAddress);
    }
}
