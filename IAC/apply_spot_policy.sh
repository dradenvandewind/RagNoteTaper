aws iam put-user-policy \
  --user-name terraform_erwan \
  --policy-name TerraformEC2Policy \
  --policy-document file://media/erwan/T7/sandbox/RagVideoDetectionPush/IAC/policy/spot_policy.json
