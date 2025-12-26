#!/bin/bash

# API 测试脚本
# 用于测试 Railway 部署的 API 端点

set -e

# 配置
API_BASE_URL="https://web-production-e22eb.up.railway.app"
TEST_RESULTS_FILE="/tmp/api-test-results.txt"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 初始化测试结果文件
echo "API 测试报告 - $(date)" > "$TEST_RESULTS_FILE"
echo "API 地址: $API_BASE_URL" >> "$TEST_RESULTS_FILE"
echo "===========================================" >> "$TEST_RESULTS_FILE"
echo "" >> "$TEST_RESULTS_FILE"

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local data="$5"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "${YELLOW}[TEST $TOTAL_TESTS]${NC} $test_name"
    echo "[TEST $TOTAL_TESTS] $test_name" >> "$TEST_RESULTS_FILE"
    echo "  Method: $method" >> "$TEST_RESULTS_FILE"
    echo "  Endpoint: $endpoint" >> "$TEST_RESULTS_FILE"
    
    # 发送请求
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_BASE_URL$endpoint")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$API_BASE_URL$endpoint")
    fi
    
    # 提取状态码和响应体
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "  Status Code: $status_code" >> "$TEST_RESULTS_FILE"
    echo "  Response: ${body:0:200}..." >> "$TEST_RESULTS_FILE"
    
    # 验证状态码
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "  ${GREEN}✅ PASSED${NC} (Status: $status_code)"
        echo "  Result: ✅ PASSED" >> "$TEST_RESULTS_FILE"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "  ${RED}❌ FAILED${NC} (Expected: $expected_status, Got: $status_code)"
        echo "  Result: ❌ FAILED (Expected: $expected_status, Got: $status_code)" >> "$TEST_RESULTS_FILE"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    
    echo "" >> "$TEST_RESULTS_FILE"
    echo ""
}

# 开始测试
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}  API 端点测试${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo ""

# 测试套件 1: 健康检查
echo -e "${YELLOW}[套件 1] 健康检查${NC}"
test_endpoint "健康检查端点" "GET" "/api/health" "200"

# 测试套件 2: tRPC 端点
echo -e "${YELLOW}[套件 2] tRPC 端点${NC}"
test_endpoint "同步状态" "GET" "/api/trpc/sync.status" "200"
test_endpoint "获取最后同步时间" "GET" "/api/trpc/sync.getLastSyncTime" "200"

# 测试套件 3: 错误处理
echo -e "${YELLOW}[套件 3] 错误处理${NC}"
test_endpoint "不存在的端点" "GET" "/api/nonexistent" "404"

# 生成测试摘要
echo "===========================================" >> "$TEST_RESULTS_FILE"
echo "测试摘要" >> "$TEST_RESULTS_FILE"
echo "===========================================" >> "$TEST_RESULTS_FILE"
echo "总测试数: $TOTAL_TESTS" >> "$TEST_RESULTS_FILE"
echo "通过: $PASSED_TESTS" >> "$TEST_RESULTS_FILE"
echo "失败: $FAILED_TESTS" >> "$TEST_RESULTS_FILE"
echo "成功率: $(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")%" >> "$TEST_RESULTS_FILE"
echo "" >> "$TEST_RESULTS_FILE"

# 打印测试摘要
echo -e "${YELLOW}===========================================${NC}"
echo -e "${YELLOW}  测试摘要${NC}"
echo -e "${YELLOW}===========================================${NC}"
echo -e "总测试数: $TOTAL_TESTS"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"
echo -e "成功率: $(awk "BEGIN {printf \"%.2f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")%"
echo ""
echo -e "详细报告已保存到: ${YELLOW}$TEST_RESULTS_FILE${NC}"
echo ""

# 退出码
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 有 $FAILED_TESTS 个测试失败${NC}"
    exit 1
fi
