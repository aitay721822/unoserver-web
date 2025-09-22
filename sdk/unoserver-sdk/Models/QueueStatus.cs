using System.Text.Json.Serialization;

namespace Unoserver.SDK.Models;

/// <summary>
/// Represents the status of the conversion queue.
/// </summary>
public record QueueStatus(
    [property: JsonPropertyName("size")] int Size,
    [property: JsonPropertyName("pending")] int Pending,
    [property: JsonPropertyName("isPaused")] bool IsPaused,
    [property: JsonPropertyName("concurrency")] int Concurrency,
    [property: JsonPropertyName("workers")] IReadOnlyList<WorkerStatus> Workers
);
