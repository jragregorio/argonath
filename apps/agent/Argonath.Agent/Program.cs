using Argonath.Agent;
using Argonath.Core;
using Argonath.Core.Services;
using Argonath.LockUI;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "Argonath Agent";
});
builder.Services.AddHttpClient();
builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddSingleton<ArgonathApiClient>();
builder.Services.AddSingleton<EnforcementEngine>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
