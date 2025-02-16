import { Stack, StackProps, RemovalPolicy, Aws } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { ApplicationLogLevel, SystemLogLevel, LoggingFormat } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, LogGroupClass, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CfnDocument } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class LambdaAdvancedLoggingControlStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new NodejsFunction(this, 'AdvancedLoggingControlFunction', {
      functionName: 'advanced-logging-control',
      entry: 'src/hello-world/handler.ts',
      handler: 'handler',
      //set application log level to ERROR and system log level to WARN
      applicationLogLevelV2: ApplicationLogLevel.ERROR,
      systemLogLevelV2: SystemLogLevel.WARN,
      //logging format must be set to JSON
      loggingFormat: LoggingFormat.JSON,
      logGroup: new LogGroup(this, 'MyLogGroup', {
        logGroupName: '/aws/lambda/advanced-logging-control',
        retention: RetentionDays.ONE_DAY,
        removalPolicy: RemovalPolicy.DESTROY,
        //set log group class to INFREQUENT_ACCESS, which is cheaper than the default STANDARD
        logGroupClass: LogGroupClass.INFREQUENT_ACCESS,
      }),
    });

    const automationIamRole = new Role(this, 'AutomationIamRole', {
      assumedBy: new ServicePrincipal('ssm.amazonaws.com'),
    });

    automationIamRole.addToPolicy(
      new PolicyStatement({
        actions: [
          'lambda:GetFunctionConfiguration',
          'lambda:UpdateFunctionConfiguration',
        ],
        resources: [`arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:*`],
      })
    );

    new CfnDocument(this, 'ModifyLambdaLogLevelDocument', {
      documentType: "Automation",
      name: 'ModifyLambdaLogLevelDocument',
      documentFormat: "YAML",
      updateMethod: "NewVersion",
      content: {
        schemaVersion: "0.3",
        description: "Modify the log level of a Lambda function temporarily. After 10 minutes, the log level will be reset to the original value.",
        assumeRole: automationIamRole.roleArn,
        parameters: {
          FunctionName: {
            type: "String",
            description: "The name of the Lambda Function",
          },
          LogLevel: {
            type: "String",
            description: "The log level to set",
            allowedValues: [
              "DEBUG",
              "INFO",
              "WARN",
            ],
          },
          Reason: {
            type: "String",
            description: "The reason for the change",
          },
        },
        mainSteps: [
          {
            name: "GetCurrentLoggingConfig",
            action: "aws:executeAwsApi",
            inputs: {
              Service: "Lambda",
              Api: "getFunctionConfiguration",
              FunctionName: "{{FunctionName}}",
            },
            outputs: [
              {
                Name: "CurrentLoggingConfig",
                Selector: "$.LoggingConfig",
                Type: "StringMap",
              },
            ],
          },
          {
            name: "ModifyLogLevel",
            action: "aws:executeAwsApi",
            inputs: {
              Service: "Lambda",
              Api: "updateFunctionConfiguration",
              FunctionName: "{{FunctionName}}",
              Description: "Update log level to {{LogLevel}}",
              LoggingConfig: {
                ApplicationLogLevel: "{{LogLevel}}",
                LogFormat: "JSON",
                SystemLogLevel: "{{LogLevel}}",
              },
            },
          },
          {
            name: "Wait10Minutes",
            action: "aws:sleep",
            inputs: {
              Duration: "PT10M",
            },
          },
          {
            name: "ResetLogLevel",
            action: "aws:executeAwsApi",
            inputs: {
              Service: "Lambda",
              Api: "updateFunctionConfiguration",
              FunctionName: "{{FunctionName}}",
              Description: "Reset log level to original value",
              LoggingConfig: "{{GetCurrentLoggingConfig.CurrentLoggingConfig}}",
            },
          }
        ]
      },
    });
  }
}
