using System.CommandLine;
using System.Text.Json;
using Unoserver.SDK;
using Unoserver.SDK.Models;

return await BuildCommandLine().Parse(args).InvokeAsync();

static UnoserverClient UnoserverClientFactory(Uri serverUri)
{
    var httpClient = new HttpClient { BaseAddress = serverUri };
    return new UnoserverClient(httpClient);
}

static RootCommand BuildCommandLine()
{
    // Define a binder for the UnoserverClient to handle the --server global option
    var serverOption = new Option<Uri>("--server")
    {
        Description = "The base URI of the Unoserver API.",
        DefaultValueFactory = _ => new Uri("http://localhost:3000")
    };

    // Root Command
    var rootCommand = new RootCommand("A CLI for interacting with the Unoserver API.")
    {
        serverOption
    };

    // Status Command
    var serializerOptions = new JsonSerializerOptions { WriteIndented = true, PropertyNameCaseInsensitive = true };

    var statusCommand = new Command("status", "Get the status of the conversion queue.");
    statusCommand.SetAction(async (parseResult) =>
    {
        try
        {
            var serverUri = parseResult.GetRequiredValue(serverOption);
            var client = UnoserverClientFactory(serverUri);
            var status = await client.GetQueueStatusAsync();
            Console.WriteLine(JsonSerializer.Serialize(status, serializerOptions));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
        }
    });
    rootCommand.Add(statusCommand);

    // Convert Command
    var fileOption = new Option<FileInfo>("--file", "-f") {
        Description = "The input file to convert.",
        Required = true
    }.AcceptExistingOnly();

    var formatOption = new Option<ConversionFormat>("--format", "-t") {
        Description = "The target format (e.g., pdf, docx).",
        Required = true
    };

    var outputOption = new Option<FileInfo>("--output", "-o") {
        Description = "The path to save the converted file. If not provided, the output will be saved in the same directory as the input file."
    };

    var filterOption = new Option<string>("--filter") {
        Description = "Optional: A custom conversion filter (e.g., 'writer_pdf_Export')."
    };

    var convertCommand = new Command("convert", "Convert a file to a different format.")
    {
        fileOption,
        formatOption,
        outputOption,
        filterOption
    };

    convertCommand.SetAction(async (parseResult) =>
    {
        try
        {
            var file = parseResult.GetRequiredValue(fileOption);
            var format = parseResult.GetRequiredValue(formatOption);
            var output = parseResult.GetValue(outputOption);
            var filter = parseResult.GetValue(filterOption);
            var serverUri = parseResult.GetRequiredValue(serverOption);
            var client = UnoserverClientFactory(serverUri);

            Console.WriteLine($"Converting '{file.FullName}' to '{format}'...");

            await using var fileStream = file.OpenRead();

            var resultStream = await client.Convert()
                .WithFile(fileStream, file.Name)
                .ToFormat(format)
                .WithFilter(filter)
                .ExecuteAsync();

            var outputPath = output?.FullName ?? Path.Combine(file.DirectoryName ?? "", $"{Path.GetFileNameWithoutExtension(file.FullName)}.{format.ToString().ToLower()}");

            await using var outputFileStream = File.Create(outputPath);
            await resultStream.CopyToAsync(outputFileStream);

            Console.WriteLine($"File converted successfully to '{outputPath}'");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: {ex.Message}");
        }
    });
    rootCommand.Add(convertCommand);

    return rootCommand;
}